/**
 * Active channel tracker — which channel sent the most recent message to PM.
 *
 * Used to route PM replies back to the originating channel only:
 *   - telegram  → reply goes to Telegram only (not Dashboard Teams)
 *   - dashboard → reply goes to Dashboard Teams only (not Telegram)
 *   - cli       → reply goes to CLI + Dashboard Teams (default)
 */

export type ActiveChannel = "cli" | "telegram" | "dashboard" | "editor" | "slack" | "discord" | "whatsapp" | "teams" | "matrix" | "signal" | "googlechat" | "irc" | "line" | "mattermost" | "twitch" | "nostr" | "nextcloud" | "synology" | "feishu";

let _current: ActiveChannel = "cli";

export const ActiveChannelState = {
  set(ch: ActiveChannel): void {
    _current = ch;
  },
  get(): ActiveChannel {
    return _current;
  },
};

// ── Editor context — tracks which project the editor chat is about ──────
let _editorProject: string | null = null;

export const EditorChannelState = {
  set(projectPath: string | null): void {
    _editorProject = projectPath;
  },
  get(): string | null {
    return _editorProject;
  },
};
