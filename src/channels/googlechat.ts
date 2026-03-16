/**
 * Google Chat channel for TOWER.
 *
 * Uses Google Chat webhook for sending + HTTP endpoint for receiving.
 * The incoming webhook handler is registered in server.ts.
 *
 * Required env vars:
 *   GOOGLE_CHAT_WEBHOOK_URL  — Incoming webhook URL for sending messages
 *   GOOGLE_CHAT_SPACE_ID     — Space ID for authorization (optional)
 */

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

const GC_MAX = 4096;

function splitMessage(text: string): string[] {
  if (text.length <= GC_MAX) return [text];
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > GC_MAX) {
    const slice = remaining.slice(0, GC_MAX);
    const lastNl = slice.lastIndexOf("\n");
    const cutAt = lastNl > GC_MAX / 2 ? lastNl + 1 : GC_MAX;
    chunks.push(remaining.slice(0, cutAt));
    remaining = remaining.slice(cutAt);
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}

async function gcSend(webhookUrl: string, text: string): Promise<void> {
  try {
    await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=UTF-8" },
      body: JSON.stringify({ text }),
    });
  } catch (err) {
    console.error("[GoogleChat]", (err as Error)?.message ?? err);
  }
}

class GoogleChatChannel implements VECChannel {
  private webhookUrl: string;
  private pendingReply = false;
  private buffer = "";

  constructor(webhookUrl: string, private pmAgent: PMAgent) {
    this.webhookUrl = webhookUrl;
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

  async handleIncoming(text: string): Promise<string> {
    const cleaned = text.replace(/@\S+\s*/g, "").trim();
    if (!cleaned) return "No message received.";

    if (cleaned === "/board" || cleaned === "!board") return ATPDatabase.taskBoard();
    if (cleaned === "/queue" || cleaned === "!queue") {
      const msgs = MessageQueue.peek();
      if (!msgs.length) return "[PM Queue] Empty.";
      const lines = [`[PM Queue] ${msgs.length} message(s):`];
      for (const m of msgs) { const ref = m.task_id ? ` ${m.task_id}` : ""; lines.push(`  [${m.type}] ${m.from_agent}${ref}: ${m.message.substring(0, 100)}`); }
      return lines.join("\n");
    }
    if (cleaned === "/events" || cleaned === "!events") {
      const events = EventLog.getEvents(20);
      if (!events.length) return "[Events] None recorded yet.";
      const lines = [`[Events] Last ${events.length}:`];
      for (const e of events) { const ts = e.timestamp ? new Date(e.timestamp).toLocaleTimeString() : "?"; const ref = e.task_id ? ` | ${e.task_id}` : ""; lines.push(`  ${ts} [${e.event_type}] ${e.agent_id || "-"}${ref} — ${(e.message || "").substring(0, 80)}`); }
      return lines.join("\n");
    }
    if (cleaned === "/dir" || cleaned === "!dir") return ATPDatabase.employeeDirectory();
    if (cleaned === "/agents" || cleaned === "!agents") {
      const lines = Object.entries(AGENT_DISPLAY_NAMES).filter(([id]) => id !== "user").map(([id, name]) => `  ${id.padEnd(12)} ${name}`);
      return ["Agents:", ...lines].join("\n");
    }
    if (cleaned === "/help" || cleaned === "!help") return "TOWER — VEC Commands\n/board — Task board\n/queue — PM queue\n/events — Recent events\n/dir — Directory\n/agents — Agent list\n/help — This help\n\nSend any text to talk to Arjun (PM).";

    this.pendingReply = true;
    this.buffer = "";
    const memory = loadAgentMemory("pm");
    const firstTime = isFirstInteraction("pm");
    if (firstTime) markFirstInteractionDone("pm");
    const founderPrompt = (memory ? `${memory}\n\n` : "") +
      (firstTime ? `[FIRST INTERACTION]\nIntroduce yourself briefly and warmly.\n\n` : "") +
      `[Message from ${founder.name} (Sir) via Google Chat — agent key: '${founder.agentKey}']\nSir says: ${cleaned}`;
    ActiveChannelState.set("googlechat");
    try { await this.pmAgent.prompt(founderPrompt); } catch (err) { this.clearPending(); return `Error: ${err}`; }
    const reply = this.buffer.trim() || "(thinking...)";
    this.clearPending();
    return reply;
  }

  private async flushReply(): Promise<void> { /* handled synchronously via handleIncoming */ }
  private clearPending(): void { this.pendingReply = false; this.buffer = ""; }

  async sendToUser(text: string): Promise<void> {
    const chunks = splitMessage(text);
    for (const chunk of chunks) await gcSend(this.webhookUrl, chunk);
  }

  async start(): Promise<void> { console.log(`  [GoogleChat] Channel ready — webhook configured`); }
  async stop(): Promise<void> { this.clearPending(); }
}

export { GoogleChatChannel };

export function createGoogleChatChannel(pmAgent: PMAgent): VECChannel | null {
  const webhookUrl = process.env.GOOGLE_CHAT_WEBHOOK_URL?.trim() ?? "";
  if (!webhookUrl) return null;
  return new GoogleChatChannel(webhookUrl, pmAgent);
}
