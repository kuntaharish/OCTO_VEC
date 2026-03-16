/**
 * Mattermost channel for TOWER.
 *
 * Uses Mattermost Bot API + WebSocket for real-time messages.
 *
 * Required env vars:
 *   MATTERMOST_URL        — Server URL (e.g. "https://mattermost.example.com")
 *   MATTERMOST_BOT_TOKEN  — Bot access token
 *   MATTERMOST_CHANNEL_ID — Channel ID to listen on
 *   MATTERMOST_AUTH_USER   — Authorized user ID
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
import WebSocket from "ws";

const MM_MAX = 4000;

function splitMessage(text: string): string[] {
  if (text.length <= MM_MAX) return [text];
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > MM_MAX) {
    const slice = remaining.slice(0, MM_MAX);
    const lastNl = slice.lastIndexOf("\n");
    const cutAt = lastNl > MM_MAX / 2 ? lastNl + 1 : MM_MAX;
    chunks.push(remaining.slice(0, cutAt));
    remaining = remaining.slice(cutAt);
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}

class MattermostChannel implements VECChannel {
  private serverUrl: string;
  private botToken: string;
  private channelId: string;
  private authUser: string;
  private ws: WebSocket | null = null;
  private pendingReply = false;
  private buffer = "";
  private botUserId = "";

  constructor(serverUrl: string, botToken: string, channelId: string, authUser: string, private pmAgent: PMAgent) {
    this.serverUrl = serverUrl.replace(/\/+$/, "");
    this.botToken = botToken;
    this.channelId = channelId;
    this.authUser = authUser;

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

  private async apiPost(text: string): Promise<void> {
    try {
      await fetch(`${this.serverUrl}/api/v4/posts`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${this.botToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ channel_id: this.channelId, message: text }),
      });
    } catch (err) {
      console.error("[Mattermost]", (err as Error)?.message ?? err);
    }
  }

  private async handleText(text: string): Promise<void> {
    const cmd = text.trim();
    if (cmd === "!board") { await this.apiPost(ATPDatabase.taskBoard()); return; }
    if (cmd === "!queue") {
      const msgs = MessageQueue.peek();
      if (!msgs.length) { await this.apiPost("[PM Queue] Empty."); return; }
      const lines = [`[PM Queue] ${msgs.length} message(s):`];
      for (const m of msgs) { const ref = m.task_id ? ` ${m.task_id}` : ""; lines.push(`  [${m.type}] ${m.from_agent}${ref}: ${m.message.substring(0, 100)}`); }
      await this.apiPost(lines.join("\n")); return;
    }
    if (cmd === "!events") {
      const events = EventLog.getEvents(20);
      if (!events.length) { await this.apiPost("[Events] None."); return; }
      const lines = [`[Events] Last ${events.length}:`];
      for (const e of events) { const ts = e.timestamp ? new Date(e.timestamp).toLocaleTimeString() : "?"; const ref = e.task_id ? ` | ${e.task_id}` : ""; lines.push(`  ${ts} [${e.event_type}] ${e.agent_id || "-"}${ref} — ${(e.message || "").substring(0, 80)}`); }
      await this.apiPost(lines.join("\n")); return;
    }
    if (cmd === "!dir") { await this.apiPost(ATPDatabase.employeeDirectory()); return; }
    if (cmd === "!agents") {
      const lines = Object.entries(AGENT_DISPLAY_NAMES).filter(([id]) => id !== "user").map(([id, name]) => `  ${id.padEnd(12)} ${name}`);
      await this.apiPost(["Agents:", ...lines].join("\n")); return;
    }
    if (cmd === "!help") { await this.apiPost("!board !queue !events !dir !agents !help — or just chat with PM"); return; }

    this.pendingReply = true;
    this.buffer = "";
    const memory = loadAgentMemory("pm");
    const firstTime = isFirstInteraction("pm");
    if (firstTime) markFirstInteractionDone("pm");
    const founderPrompt = (memory ? `${memory}\n\n` : "") +
      (firstTime ? `[FIRST INTERACTION]\nIntroduce yourself briefly.\n\n` : "") +
      `[Message from ${founder.name} (Sir) via Mattermost — agent key: '${founder.agentKey}']\nSir says: ${text}`;
    ActiveChannelState.set("mattermost");
    try { await this.pmAgent.prompt(founderPrompt); } catch (err) { this.clearPending(); await this.apiPost(`Error: ${err}`); }
  }

  private async flushReply(): Promise<void> {
    const text = this.buffer.trim();
    this.clearPending();
    if (!text) return;
    const chunks = splitMessage(text);
    for (const chunk of chunks) await this.apiPost(chunk);
  }

  private clearPending(): void { this.pendingReply = false; this.buffer = ""; }

  async sendToUser(text: string): Promise<void> {
    const chunks = splitMessage(text);
    for (const chunk of chunks) await this.apiPost(chunk);
  }

  async start(): Promise<void> {
    // Get bot user ID
    try {
      const resp = await fetch(`${this.serverUrl}/api/v4/users/me`, { headers: { "Authorization": `Bearer ${this.botToken}` } });
      const data = await resp.json() as any;
      this.botUserId = data.id ?? "";
    } catch { /* ignore */ }

    // Connect WebSocket
    const wsUrl = this.serverUrl.replace(/^http/, "ws") + `/api/v4/websocket`;
    this.ws = new WebSocket(wsUrl);
    this.ws.on("open", () => {
      this.ws!.send(JSON.stringify({ seq: 1, action: "authentication_challenge", data: { token: this.botToken } }));
      console.log(`  [Mattermost] Connected — channel: ${this.channelId}`);
    });
    this.ws.on("message", (raw: Buffer) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.event === "posted") {
          const post = JSON.parse(msg.data.post);
          if (post.user_id === this.botUserId) return; // skip own messages
          if (post.channel_id !== this.channelId) return;
          if (this.authUser && post.user_id !== this.authUser) return;
          void this.handleText(post.message);
        }
      } catch { /* ignore */ }
    });
    this.ws.on("close", () => console.warn("  [Mattermost] WebSocket closed"));
    this.ws.on("error", (err) => console.error("  [Mattermost] WS error:", err.message));
  }

  async stop(): Promise<void> {
    this.clearPending();
    if (this.ws) { this.ws.close(); this.ws = null; }
  }
}

export function createMattermostChannel(pmAgent: PMAgent): VECChannel | null {
  const serverUrl = process.env.MATTERMOST_URL?.trim() ?? "";
  const botToken = process.env.MATTERMOST_BOT_TOKEN?.trim() ?? "";
  const channelId = process.env.MATTERMOST_CHANNEL_ID?.trim() ?? "";
  if (!serverUrl || !botToken || !channelId) return null;
  const authUser = process.env.MATTERMOST_AUTH_USER?.trim() ?? "";
  return new MattermostChannel(serverUrl, botToken, channelId, authUser, pmAgent);
}
