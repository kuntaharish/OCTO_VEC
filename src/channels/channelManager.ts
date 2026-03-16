/**
 * ChannelManager — singleton that holds active channel instances
 * and exposes stop/restart capability for hot-reload from the dashboard.
 */

import type { VECChannel } from "./types.js";
import type { PMAgent } from "../agents/pmAgent.js";
import { ALL_CHANNEL_IDS, CHANNEL_LABELS, type ChannelId } from "./channelConfig.js";
import { createTelegramChannel } from "./telegram.js";
import { createSlackChannel } from "./slack.js";
import { createDiscordChannel } from "./discord.js";
import { createWhatsAppChannel } from "./whatsapp.js";
import { createTeamsChannel } from "./teams.js";
import { createMatrixChannel } from "./matrix.js";
import { createSignalChannel } from "./signal.js";
import { createGoogleChatChannel } from "./googlechat.js";
import { createIRCChannel } from "./irc.js";
import { createLINEChannel } from "./line.js";
import { createMattermostChannel } from "./mattermost.js";
import { createTwitchChannel } from "./twitch.js";
import { createNostrChannel } from "./nostr.js";
import { createNextcloudChannel } from "./nextcloud.js";
import { createSynologyChannel } from "./synology.js";
import { createFeishuChannel } from "./feishu.js";

let _pmAgent: PMAgent | null = null;
const _channels: Record<ChannelId, VECChannel | null> = Object.fromEntries(
  ALL_CHANNEL_IDS.map(id => [id, null])
) as Record<ChannelId, VECChannel | null>;

const CREATORS: Record<ChannelId, (pm: PMAgent) => VECChannel | null> = {
  telegram: createTelegramChannel,
  slack: createSlackChannel,
  discord: createDiscordChannel,
  whatsapp: createWhatsAppChannel,
  teams: createTeamsChannel,
  matrix: createMatrixChannel,
  signal: createSignalChannel,
  googlechat: createGoogleChatChannel,
  irc: createIRCChannel,
  line: createLINEChannel,
  mattermost: createMattermostChannel,
  twitch: createTwitchChannel,
  nostr: createNostrChannel,
  nextcloud: createNextcloudChannel,
  synology: createSynologyChannel,
  feishu: createFeishuChannel,
};

export const channelManager = {
  /** Called once from tower.ts during startup. */
  async initChannels(pmAgent: PMAgent): Promise<void> {
    _pmAgent = pmAgent;
    for (const id of ALL_CHANNEL_IDS) {
      _channels[id] = CREATORS[id](pmAgent);
      if (_channels[id]) await _channels[id]!.start();
    }
  },

  getChannel(id: ChannelId): VECChannel | null {
    return _channels[id];
  },

  isConnected(id: ChannelId): boolean {
    return _channels[id] !== null;
  },

  /** Stop a channel gracefully. */
  async stopChannel(id: ChannelId): Promise<void> {
    const ch = _channels[id];
    if (ch) {
      try { await ch.stop(); } catch { /* best-effort */ }
      _channels[id] = null;
    }
  },

  /** Stop the old instance, create a new one from current process.env, and start it. */
  async restartChannel(id: ChannelId): Promise<{ ok: boolean; error?: string }> {
    if (!_pmAgent) return { ok: false, error: "PM agent not initialized" };

    await this.stopChannel(id);

    try {
      const ch = CREATORS[id](_pmAgent);
      if (ch) {
        await ch.start();
        _channels[id] = ch;
        return { ok: true };
      }
      return { ok: false, error: `Missing or invalid ${CHANNEL_LABELS[id]} credentials` };
    } catch (err: any) {
      _channels[id] = null;
      return { ok: false, error: err?.message ?? "Failed to start channel" };
    }
  },
};
