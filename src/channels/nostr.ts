/**
 * Nostr channel for TOWER.
 *
 * Uses nostr-tools for decentralized Nostr protocol messaging (NIP-04 DMs).
 *
 * Required env vars:
 *   NOSTR_PRIVATE_KEY    — Bot's private key (hex)
 *   NOSTR_RELAY_URL      — Relay URL (e.g. "wss://relay.damus.io")
 *   NOSTR_AUTH_PUBKEY    — Authorized user's public key (hex)
 */

import { finalizeEvent, getPublicKey, nip04 } from "nostr-tools";
import { Relay } from "nostr-tools/relay";
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

const NOSTR_MAX = 4000;

function splitMessage(text: string): string[] {
  if (text.length <= NOSTR_MAX) return [text];
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > NOSTR_MAX) {
    const slice = remaining.slice(0, NOSTR_MAX);
    const lastNl = slice.lastIndexOf("\n");
    const cutAt = lastNl > NOSTR_MAX / 2 ? lastNl + 1 : NOSTR_MAX;
    chunks.push(remaining.slice(0, cutAt));
    remaining = remaining.slice(cutAt);
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}

class NostrChannel implements VECChannel {
  private privateKey: Uint8Array;
  private publicKey: string;
  private relayUrl: string;
  private authPubkey: string;
  private relay: Relay | null = null;
  private pendingReply = false;
  private buffer = "";

  constructor(privateKeyHex: string, relayUrl: string, authPubkey: string, private pmAgent: PMAgent) {
    this.privateKey = hexToBytes(privateKeyHex);
    this.publicKey = getPublicKey(this.privateKey);
    this.relayUrl = relayUrl;
    this.authPubkey = authPubkey;

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

  private async sendDM(pubkey: string, text: string): Promise<void> {
    if (!this.relay) return;
    try {
      const encrypted = await nip04.encrypt(this.privateKey, pubkey, text);
      const event = finalizeEvent({
        kind: 4, // NIP-04 DM
        created_at: Math.floor(Date.now() / 1000),
        tags: [["p", pubkey]],
        content: encrypted,
      }, this.privateKey);
      await this.relay.publish(event);
    } catch (err) {
      console.error("[Nostr]", (err as Error)?.message ?? err);
    }
  }

  private async handleText(text: string): Promise<void> {
    const cmd = text.trim();
    if (cmd === "/board") { await this.sendDM(this.authPubkey, ATPDatabase.taskBoard()); return; }
    if (cmd === "/queue") {
      const msgs = MessageQueue.peek();
      if (!msgs.length) { await this.sendDM(this.authPubkey, "[PM Queue] Empty."); return; }
      const lines = [`[PM Queue] ${msgs.length} message(s):`];
      for (const m of msgs) { const ref = m.task_id ? ` ${m.task_id}` : ""; lines.push(`  [${m.type}] ${m.from_agent}${ref}: ${m.message.substring(0, 100)}`); }
      await this.sendDM(this.authPubkey, lines.join("\n")); return;
    }
    if (cmd === "/events") {
      const events = EventLog.getEvents(20);
      if (!events.length) { await this.sendDM(this.authPubkey, "[Events] None."); return; }
      const lines = [`[Events] Last ${events.length}:`];
      for (const e of events) { const ts = e.timestamp ? new Date(e.timestamp).toLocaleTimeString() : "?"; const ref = e.task_id ? ` | ${e.task_id}` : ""; lines.push(`  ${ts} [${e.event_type}] ${e.agent_id || "-"}${ref} — ${(e.message || "").substring(0, 80)}`); }
      await this.sendDM(this.authPubkey, lines.join("\n")); return;
    }
    if (cmd === "/dir") { await this.sendDM(this.authPubkey, ATPDatabase.employeeDirectory()); return; }
    if (cmd === "/agents") {
      const lines = Object.entries(AGENT_DISPLAY_NAMES).filter(([id]) => id !== "user").map(([id, name]) => `  ${id.padEnd(12)} ${name}`);
      await this.sendDM(this.authPubkey, ["Agents:", ...lines].join("\n")); return;
    }
    if (cmd === "/help") { await this.sendDM(this.authPubkey, "/board /queue /events /dir /agents /help\nOr just send text to chat with PM."); return; }

    this.pendingReply = true;
    this.buffer = "";
    const memory = loadAgentMemory("pm");
    const firstTime = isFirstInteraction("pm");
    if (firstTime) markFirstInteractionDone("pm");
    const founderPrompt = (memory ? `${memory}\n\n` : "") +
      (firstTime ? `[FIRST INTERACTION]\nIntroduce yourself briefly.\n\n` : "") +
      `[Message from ${founder.name} (Sir) via Nostr — agent key: '${founder.agentKey}']\nSir says: ${text}`;
    ActiveChannelState.set("nostr");
    try { await this.pmAgent.prompt(founderPrompt); } catch (err) { this.clearPending(); await this.sendDM(this.authPubkey, `Error: ${err}`); }
  }

  private async flushReply(): Promise<void> {
    const text = this.buffer.trim();
    this.clearPending();
    if (!text) return;
    const chunks = splitMessage(text);
    for (const chunk of chunks) await this.sendDM(this.authPubkey, chunk);
  }

  private clearPending(): void { this.pendingReply = false; this.buffer = ""; }

  async sendToUser(text: string): Promise<void> {
    const chunks = splitMessage(text);
    for (const chunk of chunks) await this.sendDM(this.authPubkey, chunk);
  }

  async start(): Promise<void> {
    try {
      this.relay = await Relay.connect(this.relayUrl);
      // Subscribe to DMs addressed to us
      this.relay.subscribe([{ kinds: [4], "#p": [this.publicKey] }], {
        onevent: async (event) => {
          if (event.pubkey !== this.authPubkey) return;
          try {
            const decrypted = await nip04.decrypt(this.privateKey, event.pubkey, event.content);
            void this.handleText(decrypted);
          } catch { /* ignore decrypt errors */ }
        },
      });
      console.log(`  [Nostr] Connected to ${this.relayUrl} — pubkey: ${this.publicKey.slice(0, 16)}...`);
    } catch (err) {
      console.error("[Nostr] Failed:", (err as Error)?.message ?? err);
    }
  }

  async stop(): Promise<void> {
    this.clearPending();
    if (this.relay) { this.relay.close(); this.relay = null; }
  }
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  return bytes;
}

export function createNostrChannel(pmAgent: PMAgent): VECChannel | null {
  const privateKey = process.env.NOSTR_PRIVATE_KEY?.trim() ?? "";
  const relayUrl = process.env.NOSTR_RELAY_URL?.trim() ?? "";
  const authPubkey = process.env.NOSTR_AUTH_PUBKEY?.trim() ?? "";
  if (!privateKey || !relayUrl || !authPubkey) return null;
  return new NostrChannel(privateKey, relayUrl, authPubkey, pmAgent);
}
