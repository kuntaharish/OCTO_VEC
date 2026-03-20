/**
 * LINE channel for TOWER.
 *
 * Uses @line/bot-sdk with webhook mode. The webhook handler is registered
 * in server.ts at /api/line-webhook.
 *
 * Required env vars:
 *   LINE_CHANNEL_ACCESS_TOKEN  — Channel access token from LINE Developers
 *   LINE_CHANNEL_SECRET        — Channel secret for webhook signature verification
 *   LINE_USER_ID               — Authorized user ID to accept messages from
 */

import { messagingApi, middleware, type WebhookEvent, type TextMessage } from "@line/bot-sdk";
import type { AgentEvent } from "@mariozechner/pi-agent-core";
import { ATPDatabase } from "../atp/database.js";
import { MessageQueue } from "../atp/messageQueue.js";
import { EventLog } from "../atp/eventLog.js";
import { AGENT_DISPLAY_NAMES } from "../atp/agentMessageQueue.js";
import type { PMAgent } from "../agents/pmAgent.js";
import type { VECChannel } from "./types.js";
import { founder } from "../identity.js";
import { loadAgentMemory, isFirstInteraction, markFirstInteractionDone } from "../memory/agentMemory.js";
import { ActiveChannelState } from "./activeChannel.js";

const LINE_MAX = 5000;

function splitMessage(text: string): string[] {
  if (text.length <= LINE_MAX) return [text];
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > LINE_MAX) {
    const slice = remaining.slice(0, LINE_MAX);
    const lastNl = slice.lastIndexOf("\n");
    const cutAt = lastNl > LINE_MAX / 2 ? lastNl + 1 : LINE_MAX;
    chunks.push(remaining.slice(0, cutAt));
    remaining = remaining.slice(cutAt);
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}

class LINEChannel implements VECChannel {
  private client: messagingApi.MessagingApiClient;
  private channelSecret: string;
  private authorizedUserId: string;
  private pendingReplyToken: string | null = null;
  private pendingReply = false;
  private buffer = "";

  constructor(accessToken: string, channelSecret: string, authorizedUserId: string, private pmAgent: PMAgent) {
    this.client = new messagingApi.MessagingApiClient({ channelAccessToken: accessToken });
    this.channelSecret = channelSecret;
    this.authorizedUserId = authorizedUserId;

    pmAgent.subscribe((event: AgentEvent) => {
      if (!this.pendingReply) return;
      if (event.type === "message_update") {
        const ae = event.assistantMessageEvent;
        if (ae.type === "text_delta" && ae.delta) this.buffer += ae.delta;
      } else if (event.type === "agent_end") {
        void this.flushReply();
      }
    });
  }

  getMiddleware(): ReturnType<typeof middleware> {
    return middleware({ channelSecret: this.channelSecret });
  }

  async handleWebhookEvents(events: WebhookEvent[]): Promise<void> {
    for (const event of events) {
      if (event.type !== "message" || event.message.type !== "text") continue;
      if (event.source.type !== "user" || event.source.userId !== this.authorizedUserId) continue;
      await this.handleText(event.replyToken, event.message.text);
    }
  }

  private async handleText(replyToken: string, text: string): Promise<void> {
    const cmd = text.trim();
    const reply = async (msg: string) => {
      const chunks = splitMessage(msg);
      const messages: TextMessage[] = chunks.map(t => ({ type: "text", text: t }));
      try { await this.client.replyMessage({ replyToken, messages }); } catch (err) { console.error("[LINE]", (err as Error)?.message ?? err); }
    };

    if (cmd === "/board") { await reply(ATPDatabase.taskBoard()); return; }
    if (cmd === "/queue") {
      const msgs = MessageQueue.peek();
      if (!msgs.length) { await reply("[PM Queue] Empty."); return; }
      const lines = [`[PM Queue] ${msgs.length} message(s):`];
      for (const m of msgs) { const ref = m.task_id ? ` ${m.task_id}` : ""; lines.push(`  [${m.type}] ${m.from_agent}${ref}: ${m.message.substring(0, 100)}`); }
      await reply(lines.join("\n")); return;
    }
    if (cmd === "/events") {
      const events = EventLog.getEvents(20);
      if (!events.length) { await reply("[Events] None recorded yet."); return; }
      const lines = [`[Events] Last ${events.length}:`];
      for (const e of events) { const ts = e.timestamp ? new Date(e.timestamp).toLocaleTimeString() : "?"; const ref = e.task_id ? ` | ${e.task_id}` : ""; lines.push(`  ${ts} [${e.event_type}] ${e.agent_id || "-"}${ref} — ${(e.message || "").substring(0, 80)}`); }
      await reply(lines.join("\n")); return;
    }
    if (cmd === "/dir") { await reply(ATPDatabase.employeeDirectory()); return; }
    if (cmd === "/agents") {
      const lines = Object.entries(AGENT_DISPLAY_NAMES).filter(([id]) => id !== "user").map(([id, name]) => `  ${id.padEnd(12)} ${name}`);
      await reply(["Agents:", ...lines].join("\n")); return;
    }
    if (cmd === "/help") { await reply("TOWER — VEC Commands\n/board /queue /events /dir /agents /help\n\nSend any text to talk to Arjun (PM)."); return; }

    this.pendingReply = true;
    this.pendingReplyToken = replyToken;
    this.buffer = "";
    const memory = loadAgentMemory("pm");
    const firstTime = isFirstInteraction("pm");
    if (firstTime) markFirstInteractionDone("pm");
    const founderPrompt = (memory ? `${memory}\n\n` : "") +
      (firstTime ? `[FIRST INTERACTION]\nIntroduce yourself briefly.\n\n` : "") +
      `[Message from ${founder.name} (Sir) via LINE — agent key: '${founder.agentKey}']\nSir says: ${text}`;
    ActiveChannelState.set("line");
    try { await this.pmAgent.prompt(founderPrompt); } catch (err) { this.clearPending(); await reply(`Error: ${err}`); }
  }

  private async flushReply(): Promise<void> {
    const text = this.buffer.trim();
    const token = this.pendingReplyToken;
    this.clearPending();
    if (!text) return;
    // Reply token expired — use push message instead
    const chunks = splitMessage(text);
    for (const chunk of chunks) {
      try { await this.client.pushMessage({ to: this.authorizedUserId, messages: [{ type: "text", text: chunk }] }); } catch (err) { console.error("[LINE]", (err as Error)?.message ?? err); }
    }
  }

  private clearPending(): void { this.pendingReply = false; this.pendingReplyToken = null; this.buffer = ""; }

  async sendToUser(text: string): Promise<void> {
    const chunks = splitMessage(text);
    for (const chunk of chunks) {
      try { await this.client.pushMessage({ to: this.authorizedUserId, messages: [{ type: "text", text: chunk }] }); } catch (err) { console.error("[LINE]", (err as Error)?.message ?? err); }
    }
  }

  async start(): Promise<void> { console.log(`  [LINE] Channel ready — webhook mode`); }
  async stop(): Promise<void> { this.clearPending(); }
}

export { LINEChannel };

export function createLINEChannel(pmAgent: PMAgent): VECChannel | null {
  const accessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN?.trim() ?? "";
  const channelSecret = process.env.LINE_CHANNEL_SECRET?.trim() ?? "";
  const userId = process.env.LINE_USER_ID?.trim() ?? "";
  if (!accessToken || !channelSecret) return null;
  return new LINEChannel(accessToken, channelSecret, userId, pmAgent);
}
