/**
 * JSON-backed storage for channel credentials.
 * Follows the same pattern as modelConfig.ts setProviderApiKey.
 *
 * Security:
 * - Raw credentials are stored in data/channel-config.json (gitignored)
 * - getChannelConfigMasked() returns masked tokens for UI display
 * - No endpoint should ever return raw credentials to the browser
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import { config } from "../config.js";

const CONFIG_PATH = join(config.dataDir, "channel-config.json");

// ── All Channel IDs ─────────────────────────────────────────────────────────

export const ALL_CHANNEL_IDS = [
  "telegram", "slack", "discord", "whatsapp", "teams", "matrix",
  "signal", "googlechat", "irc", "line", "mattermost", "twitch",
  "nostr", "nextcloud", "synology", "feishu",
] as const;

export type ChannelId = (typeof ALL_CHANNEL_IDS)[number];

export function isValidChannel(v: unknown): v is ChannelId {
  return typeof v === "string" && (ALL_CHANNEL_IDS as readonly string[]).includes(v);
}

export const CHANNEL_LABELS: Record<ChannelId, string> = {
  telegram: "Telegram", slack: "Slack", discord: "Discord",
  whatsapp: "WhatsApp", teams: "Teams", matrix: "Matrix",
  signal: "Signal", googlechat: "Google Chat", irc: "IRC",
  line: "LINE", mattermost: "Mattermost", twitch: "Twitch",
  nostr: "Nostr", nextcloud: "Nextcloud Talk", synology: "Synology Chat",
  feishu: "Feishu/Lark",
};

// ── Channel credential fields (what env vars each channel needs) ────────────

export const CHANNEL_ENV_MAP: Record<ChannelId, Record<string, string>> = {
  telegram:    { botToken: "TELEGRAM_BOT_TOKEN", chatId: "TELEGRAM_CHAT_ID" },
  slack:       { botToken: "SLACK_BOT_TOKEN", appToken: "SLACK_APP_TOKEN", channelId: "SLACK_CHANNEL_ID" },
  discord:     { botToken: "DISCORD_BOT_TOKEN", channelId: "DISCORD_CHANNEL_ID" },
  whatsapp:    { authorizedJid: "WHATSAPP_AUTHORIZED_JID" },
  teams:       { incomingWebhookUrl: "TEAMS_INCOMING_WEBHOOK_URL", outgoingWebhookSecret: "TEAMS_OUTGOING_WEBHOOK_SECRET" },
  matrix:      { homeserverUrl: "MATRIX_HOMESERVER_URL", accessToken: "MATRIX_ACCESS_TOKEN", roomId: "MATRIX_ROOM_ID" },
  signal:      { phoneNumber: "SIGNAL_PHONE_NUMBER", recipient: "SIGNAL_RECIPIENT", cliPath: "SIGNAL_CLI_PATH" },
  googlechat:  { webhookUrl: "GOOGLE_CHAT_WEBHOOK_URL" },
  irc:         { server: "IRC_SERVER", port: "IRC_PORT", nickname: "IRC_NICKNAME", channel: "IRC_CHANNEL", authNick: "IRC_AUTH_NICK", useTls: "IRC_USE_TLS" },
  line:        { channelAccessToken: "LINE_CHANNEL_ACCESS_TOKEN", channelSecret: "LINE_CHANNEL_SECRET", userId: "LINE_USER_ID" },
  mattermost:  { serverUrl: "MATTERMOST_URL", botToken: "MATTERMOST_BOT_TOKEN", channelId: "MATTERMOST_CHANNEL_ID", authUser: "MATTERMOST_AUTH_USER" },
  twitch:      { botUsername: "TWITCH_BOT_USERNAME", oauthToken: "TWITCH_OAUTH_TOKEN", channel: "TWITCH_CHANNEL", authUser: "TWITCH_AUTH_USER" },
  nostr:       { privateKey: "NOSTR_PRIVATE_KEY", relayUrl: "NOSTR_RELAY_URL", authPubkey: "NOSTR_AUTH_PUBKEY" },
  nextcloud:   { serverUrl: "NEXTCLOUD_URL", username: "NEXTCLOUD_USERNAME", password: "NEXTCLOUD_PASSWORD", roomToken: "NEXTCLOUD_ROOM_TOKEN", authUser: "NEXTCLOUD_AUTH_USER" },
  synology:    { incomingUrl: "SYNOLOGY_CHAT_INCOMING_URL", outgoingToken: "SYNOLOGY_CHAT_OUTGOING_TOKEN" },
  feishu:      { webhookUrl: "FEISHU_WEBHOOK_URL", verificationToken: "FEISHU_VERIFICATION_TOKEN" },
};

// Fields that are secret (tokens, passwords) — shown masked in UI
const SECRET_FIELDS = new Set([
  "botToken", "appToken", "accessToken", "channelAccessToken", "channelSecret",
  "oauthToken", "privateKey", "password", "outgoingWebhookSecret", "outgoingToken",
  "verificationToken", "incomingWebhookUrl", "webhookUrl", "incomingUrl",
]);

// The primary "required" field per channel that determines if it's "configured"
const REQUIRED_FIELDS: Record<ChannelId, string[]> = {
  telegram:    ["botToken", "chatId"],
  slack:       ["botToken", "appToken", "channelId"],
  discord:     ["botToken", "channelId"],
  whatsapp:    ["authorizedJid"],
  teams:       ["incomingWebhookUrl"],
  matrix:      ["homeserverUrl", "accessToken", "roomId"],
  signal:      ["phoneNumber", "recipient"],
  googlechat:  ["webhookUrl"],
  irc:         ["server", "nickname", "channel", "authNick"],
  line:        ["channelAccessToken", "channelSecret"],
  mattermost:  ["serverUrl", "botToken", "channelId"],
  twitch:      ["botUsername", "oauthToken", "channel", "authUser"],
  nostr:       ["privateKey", "relayUrl", "authPubkey"],
  nextcloud:   ["serverUrl", "username", "password", "roomToken"],
  synology:    ["incomingUrl"],
  feishu:      ["webhookUrl"],
};

// ── Types ────────────────────────────────────────────────────────────────────

export type ChannelConfig = Record<string, Record<string, string> | undefined>;

export interface MaskedChannelInfo {
  configured: boolean;
  connected: boolean;
  fields: Record<string, string | null>; // field name → masked value or plain value
}

// ── Masking ──────────────────────────────────────────────────────────────────

function maskToken(token: string | undefined): string | null {
  if (!token) return null;
  if (token.length <= 8) return "****";
  return token.slice(0, 4) + "****" + token.slice(-4);
}

// ── Storage ──────────────────────────────────────────────────────────────────

export function loadChannelConfig(): ChannelConfig {
  try {
    if (!existsSync(CONFIG_PATH)) return {};
    const raw = readFileSync(CONFIG_PATH, "utf-8").trim();
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveRaw(cfg: ChannelConfig): void {
  mkdirSync(config.dataDir, { recursive: true });
  writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2), "utf-8");
}

/**
 * Save credentials for a channel. Pass null to clear.
 * Also injects into process.env so channels can be (re)started immediately.
 */
export function saveChannelCredentials(channel: ChannelId, creds: Record<string, string> | null): void {
  const cfg = loadChannelConfig();
  const envMap = CHANNEL_ENV_MAP[channel];

  if (creds) {
    cfg[channel] = creds;
    // Inject into process.env
    for (const [field, envVar] of Object.entries(envMap)) {
      if (creds[field]) process.env[envVar] = creds[field];
    }
  } else {
    delete cfg[channel];
    // Remove from process.env
    for (const envVar of Object.values(envMap)) {
      delete process.env[envVar];
    }
  }

  saveRaw(cfg);
}

/**
 * Load saved channel config into process.env on startup.
 */
export function injectChannelEnv(): void {
  const cfg = loadChannelConfig();
  for (const channelId of ALL_CHANNEL_IDS) {
    const creds = cfg[channelId];
    if (!creds) continue;
    const envMap = CHANNEL_ENV_MAP[channelId];
    for (const [field, envVar] of Object.entries(envMap)) {
      if (creds[field]) process.env[envVar] = creds[field];
    }
  }
}

/**
 * Return channel config with all tokens masked. Safe to send to the browser.
 */
export function getChannelConfigMasked(
  connected: Record<ChannelId, boolean>,
): Record<ChannelId, MaskedChannelInfo> {
  const cfg = loadChannelConfig();
  const result = {} as Record<ChannelId, MaskedChannelInfo>;

  for (const channelId of ALL_CHANNEL_IDS) {
    const creds = cfg[channelId] ?? {};
    const envMap = CHANNEL_ENV_MAP[channelId];
    const required = REQUIRED_FIELDS[channelId];

    const fields: Record<string, string | null> = {};
    for (const field of Object.keys(envMap)) {
      const val = creds[field];
      fields[field] = SECRET_FIELDS.has(field) ? maskToken(val) : (val ?? null);
    }

    result[channelId] = {
      configured: required.every(f => !!creds[f]),
      connected: connected[channelId] ?? false,
      fields,
    };
  }

  return result;
}
