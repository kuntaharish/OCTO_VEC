/**
 * Git credentials & backup configuration.
 *
 * Stores GitHub/GitLab credentials in {USER_DATA_DIR}/git-config.json.
 * Agents use these credentials for git push operations.
 * Backup pushes the entire memory directory to a dedicated git repo.
 */

import { join } from "path";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { execFileSync, execSync } from "child_process";
import { config } from "../config.js";

// ── Types ────────────────────────────────────────────────────────────────────

export interface GitConfig {
  username: string;
  email: string;
  token: string;        // PAT (Personal Access Token)
  provider: "github" | "gitlab" | "bitbucket" | "custom";
  remoteUrl: string;    // e.g. https://github.com/user/octo-vec-backup.git
  backupEnabled: boolean;
  backupIntervalHours: number; // 0 = manual only
  lastBackup: string | null;   // ISO timestamp
  lastBackupStatus: "success" | "error" | null;
  lastBackupMessage: string | null;
}

const DEFAULT_CONFIG: GitConfig = {
  username: "",
  email: "",
  token: "",
  provider: "github",
  remoteUrl: "",
  backupEnabled: false,
  backupIntervalHours: 24,
  lastBackup: null,
  lastBackupStatus: null,
  lastBackupMessage: null,
};

// ── Persistence ──────────────────────────────────────────────────────────────

const CONFIG_PATH = join(config.dataDir, "git-config.json");

export function loadGitConfig(): GitConfig {
  try {
    if (existsSync(CONFIG_PATH)) {
      const raw = JSON.parse(readFileSync(CONFIG_PATH, "utf-8"));
      return { ...DEFAULT_CONFIG, ...raw };
    }
  } catch { /* corrupt file — return defaults */ }
  return { ...DEFAULT_CONFIG };
}

export function saveGitConfig(cfg: Partial<GitConfig>): GitConfig {
  const current = loadGitConfig();
  const merged = { ...current, ...cfg };
  writeFileSync(CONFIG_PATH, JSON.stringify(merged, null, 2), "utf-8");
  return merged;
}

/** Return config with token masked for API responses. */
export function getMaskedGitConfig(): Omit<GitConfig, "token"> & { token: string; configured: boolean } {
  const cfg = loadGitConfig();
  return {
    ...cfg,
    token: cfg.token ? "••••" + cfg.token.slice(-4) : "",
    configured: !!(cfg.username && cfg.token && cfg.remoteUrl),
  };
}

// ── Git helpers ──────────────────────────────────────────────────────────────

function gitCmd(cwd: string, args: string[], env?: Record<string, string>): string {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf-8",
    timeout: 60_000,
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0", ...env },
  }).trim();
}

/** Build a remote URL with embedded token for HTTPS push. */
function buildAuthUrl(cfg: GitConfig): string {
  if (!cfg.token || !cfg.remoteUrl) return cfg.remoteUrl;
  try {
    const url = new URL(cfg.remoteUrl);
    url.username = cfg.username || "oauth2";
    url.password = cfg.token;
    return url.toString();
  } catch {
    // Not a valid URL — return as-is (SSH or custom)
    return cfg.remoteUrl;
  }
}

// ── Credential access for agent git tools ────────────────────────────────────

/** Get stored git credentials for agent push operations. Returns null if not configured. */
export function getGitCredentials(): { username: string; email: string; token: string; remoteUrl: string } | null {
  const cfg = loadGitConfig();
  if (!cfg.username || !cfg.token) return null;
  return { username: cfg.username, email: cfg.email, token: cfg.token, remoteUrl: cfg.remoteUrl };
}

// ── Backup: push memory to Git ───────────────────────────────────────────────

const BACKUP_DIR = join(config.dataDir, "memory-backup");

/**
 * Run a memory backup — commit & push all agent memory to the configured remote.
 * The backup repo lives at {USER_DATA_DIR}/memory-backup/ and mirrors the memory/ dir.
 */
export async function runMemoryBackup(): Promise<{ ok: boolean; message: string }> {
  const cfg = loadGitConfig();
  if (!cfg.username || !cfg.token || !cfg.remoteUrl) {
    return { ok: false, message: "Git credentials not configured" };
  }

  try {
    // Ensure backup dir exists
    mkdirSync(BACKUP_DIR, { recursive: true });

    // Init repo if needed
    if (!existsSync(join(BACKUP_DIR, ".git"))) {
      gitCmd(BACKUP_DIR, ["init"]);
      gitCmd(BACKUP_DIR, ["checkout", "-b", "main"]);
    }

    // Copy memory files into backup dir
    const memDir = config.memoryDir;
    if (existsSync(memDir)) {
      // Use platform-appropriate copy
      if (process.platform === "win32") {
        execSync(`robocopy "${memDir}" "${join(BACKUP_DIR, "memory")}" /MIR /NFL /NDL /NJH /NJS /NC /NS /NP`, {
          encoding: "utf-8",
          timeout: 30_000,
          // robocopy returns 1 for success with copies, 0 for no changes — both fine
        }).trim();
      } else {
        execSync(`rsync -a --delete "${memDir}/" "${join(BACKUP_DIR, "memory")}/"`, {
          encoding: "utf-8",
          timeout: 30_000,
        });
      }
    }

    // Also backup settings.json and roster.json
    for (const file of ["settings.json", "roster.json"]) {
      const src = join(config.dataDir, file);
      if (existsSync(src)) {
        const dest = join(BACKUP_DIR, file);
        writeFileSync(dest, readFileSync(src, "utf-8"), "utf-8");
      }
    }

    // Write a .gitignore
    const gitignore = join(BACKUP_DIR, ".gitignore");
    if (!existsSync(gitignore)) {
      writeFileSync(gitignore, "*.key\n*.secret\ngit-config.json\n", "utf-8");
    }

    // Stage everything
    gitCmd(BACKUP_DIR, ["add", "-A"]);

    // Check if there's anything to commit
    const status = gitCmd(BACKUP_DIR, ["status", "--porcelain"]);
    if (!status) {
      // Nothing changed — still update the timestamp
      const result = { ok: true, message: "Backup up to date — no changes" };
      saveGitConfig({ lastBackup: new Date().toISOString(), lastBackupStatus: "success", lastBackupMessage: result.message });
      return result;
    }

    // Commit
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    gitCmd(BACKUP_DIR, [
      "-c", `user.name=${cfg.username}`,
      "-c", `user.email=${cfg.email || `${cfg.username}@octovec.dev`}`,
      "commit", "-m", `backup: ${timestamp}`,
    ]);

    // Set remote
    const authUrl = buildAuthUrl(cfg);
    try {
      gitCmd(BACKUP_DIR, ["remote", "remove", "origin"]);
    } catch { /* no remote yet — fine */ }
    gitCmd(BACKUP_DIR, ["remote", "add", "origin", authUrl]);

    // Push
    gitCmd(BACKUP_DIR, ["push", "-u", "origin", "main", "--force"]);

    const result = { ok: true, message: `Backup pushed successfully at ${new Date().toLocaleString()}` };
    saveGitConfig({ lastBackup: new Date().toISOString(), lastBackupStatus: "success", lastBackupMessage: result.message });
    return result;
  } catch (err: any) {
    const message = (err.message || String(err)).slice(0, 200);
    saveGitConfig({ lastBackup: new Date().toISOString(), lastBackupStatus: "error", lastBackupMessage: message });
    return { ok: false, message };
  }
}

// ── Scheduled backup ─────────────────────────────────────────────────────────

let _backupTimer: ReturnType<typeof setInterval> | null = null;

export function startBackupSchedule(): void {
  stopBackupSchedule();
  const cfg = loadGitConfig();
  if (!cfg.backupEnabled || cfg.backupIntervalHours <= 0) return;
  if (!cfg.username || !cfg.token || !cfg.remoteUrl) return;

  const ms = cfg.backupIntervalHours * 60 * 60 * 1000;
  _backupTimer = setInterval(() => {
    runMemoryBackup().catch(() => {});
  }, ms);
}

export function stopBackupSchedule(): void {
  if (_backupTimer) { clearInterval(_backupTimer); _backupTimer = null; }
}
