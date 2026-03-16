/**
 * Synology Chat channel for TOWER.
 *
 * Uses Synology Chat webhooks (incoming + outgoing).
 * The outgoing webhook handler is registered in server.ts.
 *
 * Required env vars:
 *   SYNOLOGY_CHAT_INCOMING_URL  — Incoming webhook URL for sending messages
 *   SYNOLOGY_CHAT_OUTGOING_TOKEN — Token to verify outgoing webhook requests
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

const SYN_MAX = 4000;

function splitMessage(text: string): string[] {
  if (text.length <= SYN_MAX) return [text];
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > SYN_MAX) {
    const slice = remaining.slice(0, SYN_MAX);
    const lastNl = slice.lastIndexOf("\n");
    const cutAt = lastNl > SYN_MAX / 2 ? lastNl + 1 : SYN_MAX;
    chunks.push(remaining.slice(0, cutAt));
    remaining = remaining.slice(cutAt);
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}

class SynologyChannel implements VECChannel {
  private incomingUrl: string;
  private outgoingToken: string;
  private pendingReply = false;
  private buffer = "";

  constructor(incomingUrl: string, outgoingToken: string, private pmAgent: PMAgent) {
    this.incomingUrl = incomingUrl;
    this.outgoingToken = outgoingToken;

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

  verifyToken(token: string | undefined): boolean {
    if (!this.outgoingToken) return true;
    return token === this.outgoingToken;
  }

  async handleIncoming(text: string): Promise<string> {
    const cleaned = text.trim();
    if (!cleaned) return "No message received.";

    if (cleaned === "!board") return ATPDatabase.taskBoard();
    if (cleaned === "!queue") {
      const msgs = MessageQueue.peek();
      if (!msgs.length) return "[PM Queue] Empty.";
      const lines = [`[PM Queue] ${msgs.length} message(s):`];
      for (const m of msgs) { const ref = m.task_id ? ` ${m.task_id}` : ""; lines.push(`  [${m.type}] ${m.from_agent}${ref}: ${m.message.substring(0, 100)}`); }
      return lines.join("\n");
    }
    if (cleaned === "!events") {
      const events = EventLog.getEvents(20);
      if (!events.length) return "[Events] None.";
      const lines = [`[Events] Last ${events.length}:`];
      for (const e of events) { const ts = e.timestamp ? new Date(e.timestamp).toLocaleTimeString() : "?"; const ref = e.task_id ? ` | ${e.task_id}` : ""; lines.push(`  ${ts} [${e.event_type}] ${e.agent_id || "-"}${ref} — ${(e.message || "").substring(0, 80)}`); }
      return lines.join("\n");
    }
    if (cleaned === "!dir") return ATPDatabase.employeeDirectory();
    if (cleaned === "!agents") {
      const lines = Object.entries(AGENT_DISPLAY_NAMES).filter(([id]) => id !== "user").map(([id, name]) => `  ${id.padEnd(12)} ${name}`);
      return ["Agents:", ...lines].join("\n");
    }
    if (cleaned === "!help") return "!board !queue !events !dir !agents !help — or chat with PM";

    this.pendingReply = true;
    this.buffer = "";
    const memory = loadAgentMemory("pm");
    const firstTime = isFirstInteraction("pm");
    if (firstTime) markFirstInteractionDone("pm");
    const founderPrompt = (memory ? `${memory}\n\n` : "") +
      (firstTime ? `[FIRST INTERACTION]\nIntroduce yourself briefly.\n\n` : "") +
      `[Message from ${founder.name} (Sir) via Synology Chat — agent key: '${founder.agentKey}']\nSir says: ${cleaned}`;
    ActiveChannelState.set("synology");
    try { await this.pmAgent.prompt(founderPrompt); } catch (err) { this.clearPending(); return `Error: ${err}`; }
    const reply = this.buffer.trim() || "(thinking...)";
    this.clearPending();
    return reply;
  }

  private async flushReply(): Promise<void> { /* handled via handleIncoming */ }
  private clearPending(): void { this.pendingReply = false; this.buffer = ""; }

  async sendToUser(text: string): Promise<void> {
    const chunks = splitMessage(text);
    for (const chunk of chunks) {
      try {
        await fetch(this.incomingUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: chunk }),
        });
      } catch (err) { console.error("[Synology]", (err as Error)?.message ?? err); }
    }
  }

  async start(): Promise<void> { console.log(`  [Synology Chat] Channel ready — webhook configured`); }
  async stop(): Promise<void> { this.clearPending(); }
}

export { SynologyChannel };

export function createSynologyChannel(pmAgent: PMAgent): VECChannel | null {
  const incomingUrl = process.env.SYNOLOGY_CHAT_INCOMING_URL?.trim() ?? "";
  if (!incomingUrl) return null;
  const outgoingToken = process.env.SYNOLOGY_CHAT_OUTGOING_TOKEN?.trim() ?? "";
  return new SynologyChannel(incomingUrl, outgoingToken, pmAgent);
}
