/**
 * WhatsApp channel for TOWER.
 *
 * Routes messages from an authorized WhatsApp number to the PM agent and streams
 * the response back. Supports the same slash commands as CLI and Telegram.
 *
 * Uses Baileys (WebSocket-based, no paid API required). Auth is via QR code
 * on first run — credentials are cached in data/whatsapp-auth/ for reconnection.
 *
 * Required env vars:
 *   WHATSAPP_AUTHORIZED_JID  — authorized JID (e.g. "919876543210@s.whatsapp.net")
 */

import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
} from "@whiskeysockets/baileys";
import type { WASocket, WAMessage, ConnectionState } from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
import { join } from "path";
import { mkdirSync } from "fs";
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
import { config } from "../config.js";

const WA_AUTH_DIR = join(config.dataDir, "whatsapp-auth");

// WhatsApp max message length (safe limit)
const WA_MAX = 4096;

/** Split a long string into <= WA_MAX chunks, preferring newline boundaries. */
function splitMessage(text: string): string[] {
  if (text.length <= WA_MAX) return [text];
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > WA_MAX) {
    const slice = remaining.slice(0, WA_MAX);
    const lastNl = slice.lastIndexOf("\n");
    const cutAt = lastNl > WA_MAX / 2 ? lastNl + 1 : WA_MAX;
    chunks.push(remaining.slice(0, cutAt));
    remaining = remaining.slice(cutAt);
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}

/** Safe fire-and-forget WhatsApp send — never throws. */
async function waSend(fn: () => Promise<unknown>): Promise<void> {
  try {
    await fn();
  } catch (err) {
    console.error("[WhatsApp]", (err as Error)?.message ?? err);
  }
}

class WhatsAppChannel implements VECChannel {
  private sock: WASocket | null = null;
  private authorizedJid: string;

  // State for capturing the current PM response
  private pendingJid: string | null = null;
  private buffer = "";

  constructor(authorizedJid: string, private pmAgent: PMAgent) {
    this.authorizedJid = authorizedJid;

    // Subscribe to PM events — capture text and fire reply on agent_end
    pmAgent.subscribe((event: AgentEvent) => {
      if (this.pendingJid === null) return; // not a WhatsApp-triggered prompt

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

  private isAuthorized(jid: string): boolean {
    // Normalize: strip device suffix (e.g. "919876543210:12@s.whatsapp.net" → "919876543210@s.whatsapp.net")
    const normalized = jid.replace(/:.*@/, "@");
    return normalized === this.authorizedJid;
  }

  private async handleText(jid: string, text: string): Promise<void> {
    if (!this.isAuthorized(jid)) return;

    const cmd = text.trim();

    // ── Slash-style commands (prefixed with /) ──────────────────────────────
    if (cmd === "/board") {
      const board = ATPDatabase.taskBoard();
      await waSend(() => this.sock!.sendMessage(jid, { text: board }));
      return;
    }

    if (cmd === "/queue") {
      const msgs = MessageQueue.peek();
      if (!msgs.length) {
        await waSend(() => this.sock!.sendMessage(jid, { text: "[PM Queue] Empty." }));
      } else {
        const lines = [`[PM Queue] ${msgs.length} message(s):`];
        for (const m of msgs) {
          const ref = m.task_id ? ` ${m.task_id}` : "";
          lines.push(`  [${m.type}] ${m.from_agent}${ref}: ${m.message.substring(0, 100)}`);
        }
        await waSend(() => this.sock!.sendMessage(jid, { text: lines.join("\n") }));
      }
      return;
    }

    if (cmd === "/events") {
      const events = EventLog.getEvents(20);
      if (!events.length) {
        await waSend(() => this.sock!.sendMessage(jid, { text: "[Events] None recorded yet." }));
      } else {
        const lines = [`[Events] Last ${events.length}:`];
        for (const e of events) {
          const ts = e.timestamp ? new Date(e.timestamp).toLocaleTimeString() : "?";
          const ref = e.task_id ? ` | ${e.task_id}` : "";
          lines.push(`  ${ts} [${e.event_type}] ${e.agent_id || "-"}${ref} — ${(e.message || "").substring(0, 80)}`);
        }
        await waSend(() => this.sock!.sendMessage(jid, { text: lines.join("\n") }));
      }
      return;
    }

    if (cmd === "/dir") {
      const dir = ATPDatabase.employeeDirectory();
      await waSend(() => this.sock!.sendMessage(jid, { text: dir }));
      return;
    }

    if (cmd === "/agents") {
      const lines = Object.entries(AGENT_DISPLAY_NAMES)
        .filter(([id]) => id !== "user")
        .map(([id, name]) => `  ${id.padEnd(12)} ${name}`);
      await waSend(() => this.sock!.sendMessage(jid, { text: ["Agents:", ...lines].join("\n") }));
      return;
    }

    if (cmd === "/help") {
      const help = [
        "*TOWER — VEC Commands*",
        "/board   — Task board",
        "/queue   — PM message queue",
        "/events  — Recent events (last 20)",
        "/dir     — Employee directory",
        "/agents  — Agent list",
        "/help    — This help",
        "",
        "Send any other text to talk to Arjun (PM).",
      ].join("\n");
      await waSend(() => this.sock!.sendMessage(jid, { text: help }));
      return;
    }

    // ── Route to PM agent ─────────────────────────────────────────────────
    this.pendingJid = jid;
    this.buffer = "";

    // Send composing presence
    await waSend(() => this.sock!.presenceSubscribe(jid));
    await waSend(() => this.sock!.sendPresenceUpdate("composing", jid));

    // Inject PM's memory + founder context
    const memory = loadAgentMemory("pm");
    const firstTime = isFirstInteraction("pm");
    if (firstTime) markFirstInteractionDone("pm");

    const founderPrompt =
      (memory ? `${memory}\n\n` : "") +
      (firstTime
        ? `[FIRST INTERACTION — Sir is messaging you for the first time.]\n` +
          `Introduce yourself briefly and warmly — one sentence. Then respond to what he said. Natural, not robotic.\n\n`
        : "") +
      `[Message from ${founder.name} (Sir) via WhatsApp — agent key: '${founder.agentKey}']\n` +
      `Sir says: ${text}`;

    ActiveChannelState.set("whatsapp");
    try {
      await this.pmAgent.prompt(founderPrompt);
    } catch (err) {
      this.clearPending();
      await waSend(() => this.sock!.sendMessage(jid, { text: `Error talking to PM: ${err}` }));
    }
  }

  private async flushReply(): Promise<void> {
    const jid = this.pendingJid;
    const text = this.buffer.trim();
    this.clearPending();

    if (!jid || !text || !this.sock) return;

    // Clear composing
    await waSend(() => this.sock!.sendPresenceUpdate("paused", jid));

    const chunks = splitMessage(text);
    for (const chunk of chunks) {
      await waSend(() => this.sock!.sendMessage(jid, { text: chunk }));
    }
  }

  private clearPending(): void {
    this.pendingJid = null;
    this.buffer = "";
  }

  /** Send a proactive message to the authorized JID. */
  async sendToUser(text: string): Promise<void> {
    if (!this.sock) return;
    const chunks = splitMessage(text);
    for (const chunk of chunks) {
      await waSend(() => this.sock!.sendMessage(this.authorizedJid, { text: chunk }));
    }
  }

  async start(): Promise<void> {
    mkdirSync(WA_AUTH_DIR, { recursive: true });

    const { state, saveCreds } = await useMultiFileAuthState(WA_AUTH_DIR);
    let version: [number, number, number];
    try {
      ({ version } = await fetchLatestBaileysVersion());
    } catch {
      version = [2, 3000, 1015901307] as [number, number, number];
      console.warn("  [WhatsApp] Could not fetch latest version — using fallback version");
    }

    this.sock = makeWASocket({
      version,
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, undefined as any),
      },
      printQRInTerminal: true,
      generateHighQualityLinkPreview: false,
    });

    // Save credentials on update
    this.sock.ev.on("creds.update", saveCreds);

    // Handle connection state changes
    this.sock.ev.on("connection.update", (update: Partial<ConnectionState>) => {
      const { connection, lastDisconnect } = update;

      if (connection === "close") {
        const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

        if (shouldReconnect) {
          console.log("  [WhatsApp] Connection lost — reconnecting...");
          void this.start();
        } else {
          console.warn("  [WhatsApp] Logged out — scan QR code again to reconnect.");
        }
      } else if (connection === "open") {
        console.log(`  [WhatsApp] Connected — authorized: ${this.authorizedJid}`);
      }
    });

    // Handle incoming messages
    this.sock.ev.on("messages.upsert", async ({ messages }) => {
      for (const msg of messages) {
        // Skip messages we sent, status broadcasts, and non-text
        if (msg.key.fromMe) continue;
        if (msg.key.remoteJid === "status@broadcast") continue;

        const text =
          msg.message?.conversation ||
          msg.message?.extendedTextMessage?.text;
        if (!text) continue;

        const jid = msg.key.remoteJid;
        if (!jid) continue;

        // Mark as read
        await waSend(() =>
          this.sock!.readMessages([msg.key]),
        );

        await this.handleText(jid, text);
      }
    });

    console.log(`  [WhatsApp] Starting — auth dir: ${WA_AUTH_DIR}`);
  }

  async stop(): Promise<void> {
    this.clearPending();
    if (this.sock) {
      this.sock.end(undefined);
      this.sock = null;
    }
  }
}

/**
 * Create and return a WhatsAppChannel if WHATSAPP_AUTHORIZED_JID is set,
 * otherwise returns null (WhatsApp silently disabled).
 */
export function createWhatsAppChannel(pmAgent: PMAgent): VECChannel | null {
  const jid = process.env.WHATSAPP_AUTHORIZED_JID?.trim() ?? "";

  if (!jid) {
    return null;
  }

  if (!jid.includes("@s.whatsapp.net")) {
    console.warn("[WhatsApp] WHATSAPP_AUTHORIZED_JID should be in format '919876543210@s.whatsapp.net' — WhatsApp disabled.");
    return null;
  }

  return new WhatsAppChannel(jid, pmAgent);
}
