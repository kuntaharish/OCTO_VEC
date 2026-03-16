/**
 * Nextcloud Talk channel for TOWER.
 *
 * Uses Nextcloud Talk REST API with polling for new messages.
 *
 * Required env vars:
 *   NEXTCLOUD_URL       — Server URL (e.g. "https://cloud.example.com")
 *   NEXTCLOUD_USERNAME  — Bot username
 *   NEXTCLOUD_PASSWORD  — Bot app password
 *   NEXTCLOUD_ROOM_TOKEN — Talk room token
 *   NEXTCLOUD_AUTH_USER  — Authorized username
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

const NC_MAX = 4000;

function splitMessage(text: string): string[] {
  if (text.length <= NC_MAX) return [text];
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > NC_MAX) {
    const slice = remaining.slice(0, NC_MAX);
    const lastNl = slice.lastIndexOf("\n");
    const cutAt = lastNl > NC_MAX / 2 ? lastNl + 1 : NC_MAX;
    chunks.push(remaining.slice(0, cutAt));
    remaining = remaining.slice(cutAt);
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}

class NextcloudChannel implements VECChannel {
  private serverUrl: string;
  private auth: string;
  private roomToken: string;
  private authUser: string;
  private pollTimer: NodeJS.Timeout | null = null;
  private lastMessageId = 0;
  private pendingReply = false;
  private buffer = "";

  constructor(serverUrl: string, username: string, password: string, roomToken: string, authUser: string, private pmAgent: PMAgent) {
    this.serverUrl = serverUrl.replace(/\/+$/, "");
    this.auth = Buffer.from(`${username}:${password}`).toString("base64");
    this.roomToken = roomToken;
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

  private async sendChat(text: string): Promise<void> {
    try {
      await fetch(`${this.serverUrl}/ocs/v2.php/apps/spreed/api/v1/chat/${this.roomToken}`, {
        method: "POST",
        headers: { "Authorization": `Basic ${this.auth}`, "Content-Type": "application/json", "OCS-APIRequest": "true" },
        body: JSON.stringify({ message: text }),
      });
    } catch (err) { console.error("[Nextcloud]", (err as Error)?.message ?? err); }
  }

  private async pollMessages(): Promise<void> {
    try {
      const url = `${this.serverUrl}/ocs/v2.php/apps/spreed/api/v1/chat/${this.roomToken}?lookIntoFuture=1&lastKnownMessageId=${this.lastMessageId}&timeout=30`;
      const resp = await fetch(url, {
        headers: { "Authorization": `Basic ${this.auth}`, "OCS-APIRequest": "true", "Accept": "application/json" },
      });
      if (!resp.ok) return;
      const data = await resp.json() as any;
      const messages = data?.ocs?.data ?? [];
      for (const msg of messages) {
        if (msg.id > this.lastMessageId) this.lastMessageId = msg.id;
        if (msg.actorId !== this.authUser) continue;
        if (msg.messageType !== "comment") continue;
        void this.handleText(msg.message);
      }
    } catch { /* ignore poll errors */ }
  }

  private async handleText(text: string): Promise<void> {
    const cmd = text.trim();
    if (cmd === "!board") { await this.sendChat(ATPDatabase.taskBoard()); return; }
    if (cmd === "!queue") {
      const msgs = MessageQueue.peek();
      if (!msgs.length) { await this.sendChat("[PM Queue] Empty."); return; }
      const lines = [`[PM Queue] ${msgs.length} message(s):`];
      for (const m of msgs) { const ref = m.task_id ? ` ${m.task_id}` : ""; lines.push(`  [${m.type}] ${m.from_agent}${ref}: ${m.message.substring(0, 100)}`); }
      await this.sendChat(lines.join("\n")); return;
    }
    if (cmd === "!events") {
      const events = EventLog.getEvents(20);
      if (!events.length) { await this.sendChat("[Events] None."); return; }
      const lines = [`[Events] Last ${events.length}:`];
      for (const e of events) { const ts = e.timestamp ? new Date(e.timestamp).toLocaleTimeString() : "?"; const ref = e.task_id ? ` | ${e.task_id}` : ""; lines.push(`  ${ts} [${e.event_type}] ${e.agent_id || "-"}${ref} — ${(e.message || "").substring(0, 80)}`); }
      await this.sendChat(lines.join("\n")); return;
    }
    if (cmd === "!dir") { await this.sendChat(ATPDatabase.employeeDirectory()); return; }
    if (cmd === "!agents") {
      const lines = Object.entries(AGENT_DISPLAY_NAMES).filter(([id]) => id !== "user").map(([id, name]) => `  ${id.padEnd(12)} ${name}`);
      await this.sendChat(["Agents:", ...lines].join("\n")); return;
    }
    if (cmd === "!help") { await this.sendChat("!board !queue !events !dir !agents !help — or chat with PM"); return; }

    this.pendingReply = true;
    this.buffer = "";
    const memory = loadAgentMemory("pm");
    const firstTime = isFirstInteraction("pm");
    if (firstTime) markFirstInteractionDone("pm");
    const founderPrompt = (memory ? `${memory}\n\n` : "") +
      (firstTime ? `[FIRST INTERACTION]\nIntroduce yourself briefly.\n\n` : "") +
      `[Message from ${founder.name} (Sir) via Nextcloud Talk — agent key: '${founder.agentKey}']\nSir says: ${text}`;
    ActiveChannelState.set("nextcloud");
    try { await this.pmAgent.prompt(founderPrompt); } catch (err) { this.clearPending(); await this.sendChat(`Error: ${err}`); }
  }

  private async flushReply(): Promise<void> {
    const text = this.buffer.trim();
    this.clearPending();
    if (!text) return;
    const chunks = splitMessage(text);
    for (const chunk of chunks) await this.sendChat(chunk);
  }

  private clearPending(): void { this.pendingReply = false; this.buffer = ""; }

  async sendToUser(text: string): Promise<void> {
    const chunks = splitMessage(text);
    for (const chunk of chunks) await this.sendChat(chunk);
  }

  async start(): Promise<void> {
    // Get initial last message ID
    try {
      const resp = await fetch(`${this.serverUrl}/ocs/v2.php/apps/spreed/api/v1/chat/${this.roomToken}?lookIntoFuture=0&limit=1`, {
        headers: { "Authorization": `Basic ${this.auth}`, "OCS-APIRequest": "true", "Accept": "application/json" },
      });
      const data = await resp.json() as any;
      const msgs = data?.ocs?.data ?? [];
      if (msgs.length) this.lastMessageId = msgs[msgs.length - 1].id;
    } catch { /* ignore */ }

    // Start long-polling loop
    const poll = async () => {
      while (this.pollTimer !== null) {
        await this.pollMessages();
      }
    };
    this.pollTimer = setTimeout(() => void poll(), 0) as any;
    console.log(`  [Nextcloud Talk] Listening — room: ${this.roomToken}`);
  }

  async stop(): Promise<void> {
    this.clearPending();
    if (this.pollTimer) { clearTimeout(this.pollTimer); this.pollTimer = null; }
  }
}

export function createNextcloudChannel(pmAgent: PMAgent): VECChannel | null {
  const serverUrl = process.env.NEXTCLOUD_URL?.trim() ?? "";
  const username = process.env.NEXTCLOUD_USERNAME?.trim() ?? "";
  const password = process.env.NEXTCLOUD_PASSWORD?.trim() ?? "";
  const roomToken = process.env.NEXTCLOUD_ROOM_TOKEN?.trim() ?? "";
  if (!serverUrl || !username || !password || !roomToken) return null;
  const authUser = process.env.NEXTCLOUD_AUTH_USER?.trim() ?? "";
  return new NextcloudChannel(serverUrl, username, password, roomToken, authUser, pmAgent);
}
