/**
 * Twitch channel for TOWER.
 *
 * Uses tmi.js for Twitch IRC chat integration.
 *
 * Required env vars:
 *   TWITCH_BOT_USERNAME  — Bot username
 *   TWITCH_OAUTH_TOKEN   — OAuth token (oauth:xxx from twitchapps.com/tmi)
 *   TWITCH_CHANNEL       — Channel to join (e.g. "mystream")
 *   TWITCH_AUTH_USER     — Authorized username to accept commands from
 */

import tmi from "tmi.js";
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

const TW_MAX = 500; // Twitch chat limit

function splitMessage(text: string): string[] {
  if (text.length <= TW_MAX) return [text];
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > TW_MAX) {
    chunks.push(remaining.slice(0, TW_MAX));
    remaining = remaining.slice(TW_MAX);
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}

class TwitchChannel implements VECChannel {
  private client: tmi.Client;
  private twitchChannel: string;
  private authUser: string;
  private pendingReply = false;
  private buffer = "";

  constructor(username: string, oauthToken: string, channel: string, authUser: string, private pmAgent: PMAgent) {
    this.twitchChannel = channel;
    this.authUser = authUser.toLowerCase();
    this.client = new tmi.Client({
      options: { debug: false },
      identity: { username, password: oauthToken },
      channels: [channel],
    });

    this.client.on("message", (_channel: string, tags: tmi.ChatUserstate, message: string, self: boolean) => {
      if (self) return;
      const sender = (tags.username ?? "").toLowerCase();
      if (sender !== this.authUser) return;
      void this.handleText(message);
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

  private async handleText(text: string): Promise<void> {
    const cmd = text.trim();
    if (cmd === "!board") { await this.say(ATPDatabase.taskBoard().substring(0, TW_MAX)); return; }
    if (cmd === "!queue") {
      const msgs = MessageQueue.peek();
      await this.say(msgs.length ? `[PM Queue] ${msgs.length} message(s)` : "[PM Queue] Empty."); return;
    }
    if (cmd === "!events") {
      const events = EventLog.getEvents(3);
      if (!events.length) { await this.say("[Events] None."); return; }
      for (const e of events) await this.say(`[${e.event_type}] ${e.agent_id || "-"}: ${(e.message || "").substring(0, 80)}`);
      return;
    }
    if (cmd === "!agents") {
      const names = Object.entries(AGENT_DISPLAY_NAMES).filter(([id]) => id !== "user").map(([id, name]) => `${id}:${name}`);
      await this.say(names.join(" | ")); return;
    }
    if (cmd === "!help") { await this.say("!board !queue !events !agents !help — or chat with PM"); return; }

    this.pendingReply = true;
    this.buffer = "";
    const memory = loadAgentMemory("pm");
    const firstTime = isFirstInteraction("pm");
    if (firstTime) markFirstInteractionDone("pm");
    const founderPrompt = (memory ? `${memory}\n\n` : "") +
      (firstTime ? `[FIRST INTERACTION]\nIntroduce yourself briefly.\n\n` : "") +
      `[Message from ${founder.name} (Sir) via Twitch — agent key: '${founder.agentKey}']\nSir says: ${text}`;
    ActiveChannelState.set("twitch");
    try { await this.pmAgent.prompt(founderPrompt); } catch (err) { this.clearPending(); await this.say(`Error: ${err}`); }
  }

  private async say(text: string): Promise<void> {
    try { await this.client.say(this.twitchChannel, text); } catch (err) { console.error("[Twitch]", (err as Error)?.message ?? err); }
  }

  private async flushReply(): Promise<void> {
    const text = this.buffer.trim();
    this.clearPending();
    if (!text) return;
    const chunks = splitMessage(text);
    for (const chunk of chunks) await this.say(chunk);
  }

  private clearPending(): void { this.pendingReply = false; this.buffer = ""; }

  async sendToUser(text: string): Promise<void> {
    const chunks = splitMessage(text);
    for (const chunk of chunks) await this.say(chunk);
  }

  async start(): Promise<void> {
    try {
      await this.client.connect();
      console.log(`  [Twitch] Connected — channel: ${this.twitchChannel}, auth: ${this.authUser}`);
    } catch (err) { console.error("[Twitch] Failed:", (err as Error)?.message ?? err); }
  }

  async stop(): Promise<void> {
    this.clearPending();
    await this.client.disconnect();
  }
}

export function createTwitchChannel(pmAgent: PMAgent): VECChannel | null {
  const username = process.env.TWITCH_BOT_USERNAME?.trim() ?? "";
  const oauthToken = process.env.TWITCH_OAUTH_TOKEN?.trim() ?? "";
  const channel = process.env.TWITCH_CHANNEL?.trim() ?? "";
  const authUser = process.env.TWITCH_AUTH_USER?.trim() ?? "";
  if (!username || !oauthToken || !channel || !authUser) return null;
  return new TwitchChannel(username, oauthToken, channel, authUser, pmAgent);
}
