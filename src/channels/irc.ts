/**
 * IRC channel for TOWER.
 *
 * Uses irc-framework for connecting to any IRC server.
 *
 * Required env vars:
 *   IRC_SERVER      — IRC server hostname (e.g. "irc.libera.chat")
 *   IRC_PORT        — Port (default: 6697 for TLS)
 *   IRC_NICKNAME    — Bot nickname
 *   IRC_CHANNEL     — Channel to join (e.g. "#octo-vec")
 *   IRC_AUTH_NICK   — Authorized nickname to accept commands from
 *   IRC_USE_TLS     — "true" or "false" (default: "true")
 */

import { Client as IRCClient } from "irc-framework";
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

const IRC_MAX = 450; // IRC messages are limited ~512 bytes including protocol overhead

function splitMessage(text: string): string[] {
  if (text.length <= IRC_MAX) return [text];
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > IRC_MAX) {
    const slice = remaining.slice(0, IRC_MAX);
    const lastNl = slice.lastIndexOf("\n");
    const cutAt = lastNl > IRC_MAX / 2 ? lastNl + 1 : IRC_MAX;
    chunks.push(remaining.slice(0, cutAt));
    remaining = remaining.slice(cutAt);
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}

class IRCChannel implements VECChannel {
  private client: IRCClient;
  private ircChannel: string;
  private authNick: string;
  private pendingReply = false;
  private buffer = "";

  constructor(server: string, port: number, nickname: string, channel: string, authNick: string, useTls: boolean, private pmAgent: PMAgent) {
    this.ircChannel = channel;
    this.authNick = authNick;
    this.client = new IRCClient();
    this.client.connect({ host: server, port, nick: nickname, tls: useTls });

    this.client.on("registered", () => {
      this.client.join(channel);
      console.log(`  [IRC] Connected to ${server} — joined ${channel}`);
    });

    this.client.on("privmsg", (event: any) => {
      if (event.nick !== this.authNick) return;
      const target = event.target === nickname ? event.nick : event.target;
      void this.handleText(target, event.message);
    });

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

  private async handleText(target: string, text: string): Promise<void> {
    const cmd = text.trim();
    if (cmd === "!board") { for (const line of ATPDatabase.taskBoard().split("\n")) this.client.say(target, line); return; }
    if (cmd === "!queue") {
      const msgs = MessageQueue.peek();
      if (!msgs.length) { this.client.say(target, "[PM Queue] Empty."); return; }
      this.client.say(target, `[PM Queue] ${msgs.length} message(s)`);
      return;
    }
    if (cmd === "!events") {
      const events = EventLog.getEvents(5);
      if (!events.length) { this.client.say(target, "[Events] None."); return; }
      for (const e of events) { const ts = e.timestamp ? new Date(e.timestamp).toLocaleTimeString() : "?"; this.client.say(target, `${ts} [${e.event_type}] ${e.agent_id || "-"} — ${(e.message || "").substring(0, 80)}`); }
      return;
    }
    if (cmd === "!dir") { for (const line of ATPDatabase.employeeDirectory().split("\n").slice(0, 10)) this.client.say(target, line); return; }
    if (cmd === "!agents") {
      const lines = Object.entries(AGENT_DISPLAY_NAMES).filter(([id]) => id !== "user").map(([id, name]) => `${id}: ${name}`);
      this.client.say(target, lines.join(" | ")); return;
    }
    if (cmd === "!help") { this.client.say(target, "!board !queue !events !dir !agents !help — or just chat with PM"); return; }

    this.pendingReply = true;
    this.buffer = "";
    const memory = loadAgentMemory("pm");
    const firstTime = isFirstInteraction("pm");
    if (firstTime) markFirstInteractionDone("pm");
    const founderPrompt = (memory ? `${memory}\n\n` : "") +
      (firstTime ? `[FIRST INTERACTION]\nIntroduce yourself briefly.\n\n` : "") +
      `[Message from ${founder.name} (Sir) via IRC — agent key: '${founder.agentKey}']\nSir says: ${text}`;
    ActiveChannelState.set("irc");
    try { await this.pmAgent.prompt(founderPrompt); } catch (err) { this.clearPending(); this.client.say(target, `Error: ${err}`); }
  }

  private async flushReply(): Promise<void> {
    const text = this.buffer.trim();
    this.clearPending();
    if (!text) return;
    const chunks = splitMessage(text);
    for (const chunk of chunks) {
      for (const line of chunk.split("\n")) this.client.say(this.ircChannel, line);
    }
  }

  private clearPending(): void { this.pendingReply = false; this.buffer = ""; }

  async sendToUser(text: string): Promise<void> {
    const chunks = splitMessage(text);
    for (const chunk of chunks) {
      for (const line of chunk.split("\n")) this.client.say(this.ircChannel, line);
    }
  }

  async start(): Promise<void> { /* Connection happens in constructor */ }

  async stop(): Promise<void> {
    this.clearPending();
    this.client.quit("OCTO VEC shutting down");
  }
}

export function createIRCChannel(pmAgent: PMAgent): VECChannel | null {
  const server = process.env.IRC_SERVER?.trim() ?? "";
  const nickname = process.env.IRC_NICKNAME?.trim() ?? "";
  const channel = process.env.IRC_CHANNEL?.trim() ?? "";
  const authNick = process.env.IRC_AUTH_NICK?.trim() ?? "";
  if (!server || !nickname || !channel || !authNick) return null;
  const port = parseInt(process.env.IRC_PORT ?? "6697", 10);
  const useTls = (process.env.IRC_USE_TLS ?? "true") !== "false";
  return new IRCChannel(server, port, nickname, channel, authNick, useTls, pmAgent);
}
