/**
 * Microsoft Teams channel for TOWER.
 *
 * Uses incoming/outgoing webhooks — no Azure Bot registration required.
 * Incoming webhook: VEC → Teams (proactive messages via webhook URL)
 * Outgoing webhook: Teams → VEC (Teams calls our HTTP endpoint on mentions)
 *
 * Required env vars:
 *   TEAMS_INCOMING_WEBHOOK_URL  — Incoming Webhook connector URL for sending messages
 *   TEAMS_OUTGOING_WEBHOOK_SECRET — HMAC secret from the outgoing webhook config (optional, for auth)
 *
 * The outgoing webhook listener runs on the dashboard HTTP server (see server.ts),
 * so no extra port is needed.
 */

import { createHmac } from "crypto";
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

// Teams message card max text length
const TEAMS_MAX = 4000;

/** Split a long string into <= TEAMS_MAX chunks, preferring newline boundaries. */
function splitMessage(text: string): string[] {
  if (text.length <= TEAMS_MAX) return [text];
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > TEAMS_MAX) {
    const slice = remaining.slice(0, TEAMS_MAX);
    const lastNl = slice.lastIndexOf("\n");
    const cutAt = lastNl > TEAMS_MAX / 2 ? lastNl + 1 : TEAMS_MAX;
    chunks.push(remaining.slice(0, cutAt));
    remaining = remaining.slice(cutAt);
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}

/** Send a message to Teams via the incoming webhook URL. */
async function teamsSend(webhookUrl: string, text: string): Promise<void> {
  try {
    await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
  } catch (err) {
    console.error("[Teams]", (err as Error)?.message ?? err);
  }
}

class TeamsChannel implements VECChannel {
  private webhookUrl: string;
  private webhookSecret: string | null;

  // State for capturing the current PM response
  private pendingReply = false;
  private buffer = "";

  constructor(webhookUrl: string, webhookSecret: string | null, private pmAgent: PMAgent) {
    this.webhookUrl = webhookUrl;
    this.webhookSecret = webhookSecret;

    // Subscribe to PM events
    pmAgent.subscribe((event: AgentEvent) => {
      if (!this.pendingReply) return;

      if (event.type === "message_update") {
        const ae = event.assistantMessageEvent;
        if (ae.type === "text_delta" && ae.delta) {
          this.buffer += ae.delta;
        }
      } else if (event.type === "agent_end") {
        void this.flushReply();
      }
    });
  }

  /**
   * Verify the HMAC signature from Teams outgoing webhook.
   * Returns true if no secret configured (open mode) or if signature matches.
   */
  verifySignature(body: string, authHeader: string | undefined): boolean {
    if (!this.webhookSecret) return true; // no secret = skip verification
    if (!authHeader) return false;

    // Teams sends: "HMAC <base64>"
    const token = authHeader.replace(/^HMAC\s+/i, "").trim();
    const expected = createHmac("sha256", Buffer.from(this.webhookSecret, "base64"))
      .update(body)
      .digest("base64");

    return token === expected;
  }

  /**
   * Handle an incoming message from Teams outgoing webhook.
   * Called from the dashboard HTTP server route handler.
   */
  async handleIncoming(text: string): Promise<string> {
    // Strip the bot mention (Teams outgoing webhooks prepend "<at>BotName</at> ")
    const cleaned = text.replace(/<at>.*?<\/at>\s*/gi, "").trim();

    if (!cleaned) return "No message received.";

    // ── Slash-style commands ──────────────────────────────────────────────
    if (cleaned === "/board" || cleaned === "!board") {
      return ATPDatabase.taskBoard();
    }

    if (cleaned === "/queue" || cleaned === "!queue") {
      const msgs = MessageQueue.peek();
      if (!msgs.length) return "[PM Queue] Empty.";
      const lines = [`[PM Queue] ${msgs.length} message(s):`];
      for (const m of msgs) {
        const ref = m.task_id ? ` ${m.task_id}` : "";
        lines.push(`  [${m.type}] ${m.from_agent}${ref}: ${m.message.substring(0, 100)}`);
      }
      return lines.join("\n");
    }

    if (cleaned === "/events" || cleaned === "!events") {
      const events = EventLog.getEvents(20);
      if (!events.length) return "[Events] None recorded yet.";
      const lines = [`[Events] Last ${events.length}:`];
      for (const e of events) {
        const ts = e.timestamp ? new Date(e.timestamp).toLocaleTimeString() : "?";
        const ref = e.task_id ? ` | ${e.task_id}` : "";
        lines.push(`  ${ts} [${e.event_type}] ${e.agent_id || "-"}${ref} — ${(e.message || "").substring(0, 80)}`);
      }
      return lines.join("\n");
    }

    if (cleaned === "/dir" || cleaned === "!dir") {
      return ATPDatabase.employeeDirectory();
    }

    if (cleaned === "/agents" || cleaned === "!agents") {
      const lines = Object.entries(AGENT_DISPLAY_NAMES)
        .filter(([id]) => id !== "user")
        .map(([id, name]) => `  ${id.padEnd(12)} ${name}`);
      return ["Agents:", ...lines].join("\n");
    }

    if (cleaned === "/help" || cleaned === "!help") {
      return [
        "TOWER — VEC Commands",
        "/board   — Task board",
        "/queue   — PM message queue",
        "/events  — Recent events (last 20)",
        "/dir     — Employee directory",
        "/agents  — Agent list",
        "/help    — This help",
        "",
        "Send any other text to talk to Arjun (PM).",
      ].join("\n");
    }

    // ── Route to PM agent ─────────────────────────────────────────────────
    this.pendingReply = true;
    this.buffer = "";

    const memory = loadAgentMemory("pm");
    const firstTime = isFirstInteraction("pm");
    if (firstTime) markFirstInteractionDone("pm");

    const founderPrompt =
      (memory ? `${memory}\n\n` : "") +
      (firstTime
        ? `[FIRST INTERACTION — Sir is messaging you for the first time.]\n` +
          `Introduce yourself briefly and warmly — one sentence. Then respond to what he said. Natural, not robotic.\n\n`
        : "") +
      `[Message from ${founder.name} (Sir) via Teams — agent key: '${founder.agentKey}']\n` +
      `Sir says: ${cleaned}`;

    ActiveChannelState.set("teams");
    try {
      await this.pmAgent.prompt(founderPrompt);
    } catch (err) {
      this.clearPending();
      return `Error talking to PM: ${err}`;
    }

    // Return the buffered response (for outgoing webhook's synchronous reply)
    const reply = this.buffer.trim() || "(thinking...)";
    this.clearPending();
    return reply;
  }

  private async flushReply(): Promise<void> {
    // For outgoing webhook, reply is returned synchronously via handleIncoming.
    // This flush handles proactive messages from PM events (e.g. inbox forwarding).
    const text = this.buffer.trim();
    if (!text || !this.pendingReply) return;

    // Don't clear pending here — handleIncoming reads buffer synchronously
  }

  private clearPending(): void {
    this.pendingReply = false;
    this.buffer = "";
  }

  /** Send a proactive message to Teams via incoming webhook. */
  async sendToUser(text: string): Promise<void> {
    const chunks = splitMessage(text);
    for (const chunk of chunks) {
      await teamsSend(this.webhookUrl, chunk);
    }
  }

  async start(): Promise<void> {
    // Teams doesn't need a persistent connection — incoming webhook is HTTP push,
    // outgoing webhook handler is registered in server.ts
    console.log(`  [Teams] Channel ready — webhook configured`);
  }

  async stop(): Promise<void> {
    this.clearPending();
  }
}

// Export the class for server.ts to access handleIncoming / verifySignature
export { TeamsChannel };

/**
 * Create and return a TeamsChannel if TEAMS_INCOMING_WEBHOOK_URL is set,
 * otherwise returns null (Teams silently disabled).
 */
export function createTeamsChannel(pmAgent: PMAgent): VECChannel | null {
  const webhookUrl = process.env.TEAMS_INCOMING_WEBHOOK_URL?.trim() ?? "";

  if (!webhookUrl) {
    return null;
  }

  const webhookSecret = process.env.TEAMS_OUTGOING_WEBHOOK_SECRET?.trim() || null;

  return new TeamsChannel(webhookUrl, webhookSecret, pmAgent);
}
