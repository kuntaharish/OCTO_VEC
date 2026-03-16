/**
 * Signal channel for TOWER.
 *
 * Uses signal-cli (must be installed separately) via JSON-RPC over stdin/stdout.
 * signal-cli is a Java-based CLI for Signal — install via:
 *   https://github.com/AsamK/signal-cli
 *
 * Required env vars:
 *   SIGNAL_CLI_PATH       — path to signal-cli binary (default: "signal-cli")
 *   SIGNAL_PHONE_NUMBER   — registered Signal phone number (e.g. "+1234567890")
 *   SIGNAL_RECIPIENT      — authorized recipient number to accept messages from
 */

import { spawn, type ChildProcess } from "child_process";
import { createInterface, type Interface as RLInterface } from "readline";
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

const SIG_MAX = 4000;

function splitMessage(text: string): string[] {
  if (text.length <= SIG_MAX) return [text];
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > SIG_MAX) {
    const slice = remaining.slice(0, SIG_MAX);
    const lastNl = slice.lastIndexOf("\n");
    const cutAt = lastNl > SIG_MAX / 2 ? lastNl + 1 : SIG_MAX;
    chunks.push(remaining.slice(0, cutAt));
    remaining = remaining.slice(cutAt);
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}

class SignalChannel implements VECChannel {
  private cliPath: string;
  private phoneNumber: string;
  private recipient: string;
  private proc: ChildProcess | null = null;
  private rl: RLInterface | null = null;
  private pendingReply = false;
  private buffer = "";

  constructor(cliPath: string, phoneNumber: string, recipient: string, private pmAgent: PMAgent) {
    this.cliPath = cliPath;
    this.phoneNumber = phoneNumber;
    this.recipient = recipient;

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

  private async sendMessage(recipient: string, text: string): Promise<void> {
    try {
      const child = spawn(this.cliPath, ["-a", this.phoneNumber, "send", "-m", text, recipient]);
      await new Promise<void>((resolve) => child.on("close", () => resolve()));
    } catch (err) {
      console.error("[Signal]", (err as Error)?.message ?? err);
    }
  }

  private async handleText(sender: string, text: string): Promise<void> {
    if (sender !== this.recipient) return;
    const cmd = text.trim();

    if (cmd === "/board") { await this.sendMessage(sender, ATPDatabase.taskBoard()); return; }
    if (cmd === "/queue") {
      const msgs = MessageQueue.peek();
      if (!msgs.length) { await this.sendMessage(sender, "[PM Queue] Empty."); return; }
      const lines = [`[PM Queue] ${msgs.length} message(s):`];
      for (const m of msgs) { const ref = m.task_id ? ` ${m.task_id}` : ""; lines.push(`  [${m.type}] ${m.from_agent}${ref}: ${m.message.substring(0, 100)}`); }
      await this.sendMessage(sender, lines.join("\n")); return;
    }
    if (cmd === "/events") {
      const events = EventLog.getEvents(20);
      if (!events.length) { await this.sendMessage(sender, "[Events] None recorded yet."); return; }
      const lines = [`[Events] Last ${events.length}:`];
      for (const e of events) { const ts = e.timestamp ? new Date(e.timestamp).toLocaleTimeString() : "?"; const ref = e.task_id ? ` | ${e.task_id}` : ""; lines.push(`  ${ts} [${e.event_type}] ${e.agent_id || "-"}${ref} — ${(e.message || "").substring(0, 80)}`); }
      await this.sendMessage(sender, lines.join("\n")); return;
    }
    if (cmd === "/dir") { await this.sendMessage(sender, ATPDatabase.employeeDirectory()); return; }
    if (cmd === "/agents") {
      const lines = Object.entries(AGENT_DISPLAY_NAMES).filter(([id]) => id !== "user").map(([id, name]) => `  ${id.padEnd(12)} ${name}`);
      await this.sendMessage(sender, ["Agents:", ...lines].join("\n")); return;
    }
    if (cmd === "/help") {
      await this.sendMessage(sender, "TOWER — VEC Commands\n/board — Task board\n/queue — PM queue\n/events — Recent events\n/dir — Directory\n/agents — Agent list\n/help — This help\n\nSend any text to talk to Arjun (PM)."); return;
    }

    this.pendingReply = true;
    this.buffer = "";
    const memory = loadAgentMemory("pm");
    const firstTime = isFirstInteraction("pm");
    if (firstTime) markFirstInteractionDone("pm");
    const founderPrompt = (memory ? `${memory}\n\n` : "") +
      (firstTime ? `[FIRST INTERACTION — Sir is messaging you for the first time.]\nIntroduce yourself briefly and warmly — one sentence. Then respond to what he said. Natural, not robotic.\n\n` : "") +
      `[Message from ${founder.name} (Sir) via Signal — agent key: '${founder.agentKey}']\nSir says: ${text}`;
    ActiveChannelState.set("signal");
    try { await this.pmAgent.prompt(founderPrompt); } catch (err) { this.clearPending(); await this.sendMessage(sender, `Error talking to PM: ${err}`); }
  }

  private async flushReply(): Promise<void> {
    const text = this.buffer.trim();
    this.clearPending();
    if (!text) return;
    const chunks = splitMessage(text);
    for (const chunk of chunks) await this.sendMessage(this.recipient, chunk);
  }

  private clearPending(): void { this.pendingReply = false; this.buffer = ""; }

  async sendToUser(text: string): Promise<void> {
    const chunks = splitMessage(text);
    for (const chunk of chunks) await this.sendMessage(this.recipient, chunk);
  }

  async start(): Promise<void> {
    this.proc = spawn(this.cliPath, ["-a", this.phoneNumber, "jsonRpc"], { stdio: ["pipe", "pipe", "pipe"] });
    this.rl = createInterface({ input: this.proc.stdout! });
    this.rl.on("line", (line) => {
      try {
        const msg = JSON.parse(line);
        if (msg.method === "receive" && msg.params?.envelope?.dataMessage?.message) {
          const sender = msg.params.envelope.source;
          const text = msg.params.envelope.dataMessage.message;
          void this.handleText(sender, text);
        }
      } catch { /* ignore parse errors */ }
    });
    this.proc.on("close", () => console.warn("  [Signal] signal-cli process exited"));
    console.log(`  [Signal] Listening — phone: ${this.phoneNumber}, authorized: ${this.recipient}`);
  }

  async stop(): Promise<void> {
    this.clearPending();
    if (this.rl) { this.rl.close(); this.rl = null; }
    if (this.proc) { this.proc.kill(); this.proc = null; }
  }
}

export function createSignalChannel(pmAgent: PMAgent): VECChannel | null {
  const cliPath = process.env.SIGNAL_CLI_PATH?.trim() || "signal-cli";
  const phoneNumber = process.env.SIGNAL_PHONE_NUMBER?.trim() ?? "";
  const recipient = process.env.SIGNAL_RECIPIENT?.trim() ?? "";
  if (!phoneNumber || !recipient) return null;
  return new SignalChannel(cliPath, phoneNumber, recipient, pmAgent);
}
