/**
 * Git versioning tools — tiered by permission level.
 *
 * Three tiers:
 *   read  → git_status, git_diff, git_log
 *   write → read + git_add, git_commit
 *   admin → write + git_init
 *
 * Per-agent identity: commits use the agent's name from roster
 * with email as {agent_id}@octovec.dev (git doesn't verify emails).
 */

import { execFileSync } from "child_process";
import { existsSync, mkdirSync, writeFileSync } from "fs";
import { join, resolve, normalize, sep } from "path";
import { Type } from "@mariozechner/pi-ai";
import type { AgentTool } from "@mariozechner/pi-agent-core";
import { projectsWorkspace } from "../../config.js";
import { getRosterEntry } from "../../ar/roster.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

function ok(text: string) {
  return { content: [{ type: "text" as const, text }], details: {} };
}

/**
 * Resolve a project name to an absolute path inside workspace/projects/.
 * Throws if the resolved path escapes the projects directory.
 */
function resolveProjectDir(project: string): string {
  const resolved = resolve(projectsWorkspace, normalize(project));
  if (resolved !== projectsWorkspace && !resolved.startsWith(projectsWorkspace + sep)) {
    throw new Error(`Path traversal blocked: '${project}' resolves outside projects/`);
  }
  return resolved;
}

/** Run a git command in a directory and return stdout. */
function git(cwd: string, args: string[]): string {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf-8",
    timeout: 30_000,
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
  }).trim();
}

/** Check if a directory has a .git folder. */
function isGitRepo(dir: string): boolean {
  return existsSync(join(dir, ".git"));
}

/** Resolve git author identity from roster. */
function getGitIdentity(agentId?: string): { name: string; email: string } {
  if (!agentId) return { name: "OCTO-VEC", email: "agent@octovec.dev" };
  const entry = getRosterEntry(agentId);
  if (!entry) return { name: "OCTO-VEC", email: "agent@octovec.dev" };
  return { name: entry.name, email: `${agentId}@octovec.dev` };
}

const DEFAULT_GITIGNORE = `node_modules/
dist/
build/
.env
.env.*
*.log
.DS_Store
Thumbs.db
coverage/
.cache/
`;

// ── Tiered Git Tools ─────────────────────────────────────────────────────────

/** Read-only git tools: status, diff, log. */
export function getGitReadTools(agentId: string): AgentTool[] {
  const git_status: AgentTool = {
    name: "git_status",
    label: "Git Status",
    description: "Show the git status of a project directory.",
    parameters: Type.Object({
      project: Type.String({ description: "Project folder name under workspace/projects/" }),
    }),
    execute: async (_, params: any) => {
      const dir = resolveProjectDir(params.project);
      if (!isGitRepo(dir)) return ok(`ERROR: '${params.project}' is not a git repository. Use git_init first.`);
      const output = git(dir, ["status"]);
      return ok(output);
    },
  };

  const git_diff: AgentTool = {
    name: "git_diff",
    label: "Git Diff",
    description: "Show file changes in a project. Use staged=true to see staged changes.",
    parameters: Type.Object({
      project: Type.String({ description: "Project folder name under workspace/projects/" }),
      staged: Type.Optional(Type.Boolean({ description: "If true, show staged changes (--staged). Default: false." })),
    }),
    execute: async (_, params: any) => {
      const dir = resolveProjectDir(params.project);
      if (!isGitRepo(dir)) return ok(`ERROR: '${params.project}' is not a git repository.`);
      const args = params.staged ? ["diff", "--staged"] : ["diff"];
      const output = git(dir, args);
      return ok(output || "(no changes)");
    },
  };

  const git_log: AgentTool = {
    name: "git_log",
    label: "Git Log",
    description: "Show commit history for a project.",
    parameters: Type.Object({
      project: Type.String({ description: "Project folder name under workspace/projects/" }),
      limit: Type.Optional(Type.Number({ description: "Max number of commits to show. Default: 20." })),
    }),
    execute: async (_, params: any) => {
      const dir = resolveProjectDir(params.project);
      if (!isGitRepo(dir)) return ok(`ERROR: '${params.project}' is not a git repository.`);
      const n = params.limit ?? 20;
      const output = git(dir, ["log", "--oneline", `-n`, String(n)]);
      return ok(output || "(no commits yet)");
    },
  };

  return [git_status, git_diff, git_log];
}

/** Write-level git tools: add, commit (uses agent identity). */
export function getGitWriteTools(agentId: string): AgentTool[] {
  const { name, email } = getGitIdentity(agentId);

  const git_add: AgentTool = {
    name: "git_add",
    label: "Git Add",
    description: "Stage files for commit. Defaults to staging all changes.",
    parameters: Type.Object({
      project: Type.String({ description: "Project folder name under workspace/projects/" }),
      files: Type.Optional(Type.String({ description: "Space-separated file paths to stage. Default: '.' (all)" })),
    }),
    execute: async (_, params: any) => {
      const dir = resolveProjectDir(params.project);
      if (!isGitRepo(dir)) return ok(`ERROR: '${params.project}' is not a git repository.`);
      const fileArgs = params.files ? params.files.split(/\s+/) : ["."];
      git(dir, ["add", ...fileArgs]);
      const status = git(dir, ["status", "--short"]);
      return ok(`Staged files in '${params.project}'.\n${status}`);
    },
  };

  const git_commit: AgentTool = {
    name: "git_commit",
    label: "Git Commit",
    description:
      `Commit staged changes with a message. If nothing is staged, auto-stages all changes first. ` +
      `Author: ${name}.`,
    parameters: Type.Object({
      project: Type.String({ description: "Project folder name under workspace/projects/" }),
      message: Type.String({ description: "Commit message describing the changes" }),
    }),
    execute: async (_, params: any) => {
      const dir = resolveProjectDir(params.project);
      if (!isGitRepo(dir)) return ok(`ERROR: '${params.project}' is not a git repository. Use git_init first.`);

      // Auto-stage if nothing is staged
      const staged = git(dir, ["diff", "--staged", "--stat"]);
      if (!staged) {
        const porcelain = git(dir, ["status", "--porcelain"]);
        if (!porcelain) return ok("Nothing to commit — working tree clean.");
        git(dir, ["add", "-A"]);
      }

      const output = git(dir, [
        "-c", `user.name=${name}`,
        "-c", `user.email=${email}`,
        "commit", "-m", params.message,
      ]);
      return ok(output);
    },
  };

  const git_push: AgentTool = {
    name: "git_push",
    label: "Git Push",
    description:
      "Push commits to a remote repository. Uses stored Git credentials from Settings → Versioning. " +
      "If no remote is set, adds one from the stored config.",
    parameters: Type.Object({
      project: Type.String({ description: "Project folder name under workspace/projects/" }),
      branch: Type.Optional(Type.String({ description: "Branch to push. Default: current branch." })),
      remote: Type.Optional(Type.String({ description: "Remote name. Default: 'origin'." })),
    }),
    execute: async (_, params: any) => {
      const dir = resolveProjectDir(params.project);
      if (!isGitRepo(dir)) return ok(`ERROR: '${params.project}' is not a git repository.`);

      // Get stored credentials
      let creds: { username: string; email: string; token: string; remoteUrl: string } | null = null;
      try {
        const { getGitCredentials } = await import("../../dashboard/gitConfig.js");
        creds = getGitCredentials();
      } catch { /* gitConfig not available */ }

      if (!creds || !creds.token) {
        return ok("ERROR: No Git credentials configured. Ask the user to set up Git credentials in Settings → Versioning.");
      }

      const remoteName = params.remote ?? "origin";
      const branch = params.branch ?? git(dir, ["rev-parse", "--abbrev-ref", "HEAD"]);

      // Ensure remote exists
      try {
        git(dir, ["remote", "get-url", remoteName]);
      } catch {
        // No remote — add one from stored config
        if (creds.remoteUrl) {
          git(dir, ["remote", "add", remoteName, creds.remoteUrl]);
        } else {
          return ok(`ERROR: No remote '${remoteName}' configured and no default remote URL in Git settings.`);
        }
      }

      // Inject credentials into remote URL for push
      const currentUrl = git(dir, ["remote", "get-url", remoteName]);
      let authUrl = currentUrl;
      try {
        const url = new URL(currentUrl);
        url.username = creds.username;
        url.password = creds.token;
        authUrl = url.toString();
      } catch { /* SSH or non-URL format — push as-is */ }

      // Temporarily set the auth URL, push, then restore
      git(dir, ["remote", "set-url", remoteName, authUrl]);
      try {
        const output = git(dir, ["push", "-u", remoteName, branch]);
        return ok(output || `Pushed '${branch}' to '${remoteName}' successfully.`);
      } finally {
        // Restore original URL (without embedded credentials)
        git(dir, ["remote", "set-url", remoteName, currentUrl]);
      }
    },
  };

  const git_remote: AgentTool = {
    name: "git_remote",
    label: "Git Remote",
    description: "Manage remote repositories. Add, remove, or list remotes.",
    parameters: Type.Object({
      project: Type.String({ description: "Project folder name under workspace/projects/" }),
      action: Type.Union([
        Type.Literal("list"),
        Type.Literal("add"),
        Type.Literal("remove"),
      ], { description: "Action: 'list', 'add', or 'remove'" }),
      name: Type.Optional(Type.String({ description: "Remote name (required for add/remove)" })),
      url: Type.Optional(Type.String({ description: "Remote URL (required for add)" })),
    }),
    execute: async (_, params: any) => {
      const dir = resolveProjectDir(params.project);
      if (!isGitRepo(dir)) return ok(`ERROR: '${params.project}' is not a git repository.`);

      if (params.action === "list") {
        const output = git(dir, ["remote", "-v"]);
        return ok(output || "(no remotes)");
      }
      if (params.action === "add") {
        if (!params.name || !params.url) return ok("ERROR: 'name' and 'url' are required for add.");
        git(dir, ["remote", "add", params.name, params.url]);
        return ok(`Added remote '${params.name}' → ${params.url}`);
      }
      if (params.action === "remove") {
        if (!params.name) return ok("ERROR: 'name' is required for remove.");
        git(dir, ["remote", "remove", params.name]);
        return ok(`Removed remote '${params.name}'.`);
      }
      return ok("ERROR: Unknown action. Use 'list', 'add', or 'remove'.");
    },
  };

  return [git_add, git_commit, git_push, git_remote];
}

/** Admin-level git tools: init (uses agent identity). */
export function getGitAdminTools(agentId: string): AgentTool[] {
  const { name, email } = getGitIdentity(agentId);

  const git_init: AgentTool = {
    name: "git_init",
    label: "Git Init",
    description:
      "Initialize a new git repository in a project folder under workspace/projects/. " +
      "Creates a .gitignore and makes an initial commit.",
    parameters: Type.Object({
      project: Type.String({ description: "Project folder name under workspace/projects/ (e.g. 'my-app')" }),
    }),
    execute: async (_, params: any) => {
      const dir = resolveProjectDir(params.project);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
      if (isGitRepo(dir)) {
        return ok(`Project '${params.project}' already has a git repository.`);
      }
      git(dir, ["init"]);
      const gitignorePath = join(dir, ".gitignore");
      if (!existsSync(gitignorePath)) {
        writeFileSync(gitignorePath, DEFAULT_GITIGNORE, "utf-8");
      }
      git(dir, ["add", "-A"]);
      git(dir, [
        "-c", `user.name=${name}`,
        "-c", `user.email=${email}`,
        "commit", "-m", "Initial commit",
        "--allow-empty",
      ]);
      return ok(`Initialized git repository in projects/${params.project}/ with initial commit.`);
    },
  };

  return [git_init];
}

/** All git tools (backwards compat — returns all tiers). */
export function getGitTools(agentId: string): AgentTool[] {
  return [
    ...getGitAdminTools(agentId),
    ...getGitReadTools(agentId),
    ...getGitWriteTools(agentId),
  ];
}

// ── Auto-commit helper (used by devAgent task lifecycle) ──────────────────────

/**
 * Auto-initialize a git repo in a project folder if it doesn't have one yet.
 * Called before task execution when folder_access points to a projects/ path.
 */
export function autoInitRepo(projectDir: string, agentId?: string): void {
  if (!existsSync(projectDir) || isGitRepo(projectDir)) return;

  const { name, email } = getGitIdentity(agentId);
  git(projectDir, ["init"]);
  const gitignorePath = join(projectDir, ".gitignore");
  if (!existsSync(gitignorePath)) {
    writeFileSync(gitignorePath, DEFAULT_GITIGNORE, "utf-8");
  }
  git(projectDir, ["add", "-A"]);
  try {
    git(projectDir, [
      "-c", `user.name=${name}`,
      "-c", `user.email=${email}`,
      "commit", "-m", "Initial commit [auto-init]",
      "--allow-empty",
    ]);
  } catch {
    // empty repo, nothing to commit — that's fine
  }
}

/**
 * Auto-commit any uncommitted changes after a completed task.
 * Returns true if a commit was made, false if working tree was clean.
 */
export function autoCommitIfDirty(projectDir: string, taskId: string, taskDescription: string, agentId?: string): boolean {
  if (!existsSync(projectDir) || !isGitRepo(projectDir)) return false;

  const porcelain = git(projectDir, ["status", "--porcelain"]);
  if (!porcelain) return false; // clean

  const { name, email } = getGitIdentity(agentId);
  git(projectDir, ["add", "-A"]);
  const msg = `${taskId}: ${taskDescription.slice(0, 100)} [auto-commit]`;
  git(projectDir, [
    "-c", `user.name=${name}`,
    "-c", `user.email=${email}`,
    "commit", "-m", msg,
  ]);
  return true;
}

/**
 * Extract the project directory from a task's folder_access field.
 * Returns the absolute path if it's a projects/ path, null otherwise.
 */
export function getProjectDirFromFolderAccess(folderAccess: string): string | null {
  if (!folderAccess) return null;
  // folder_access is relative to workspace, e.g. "projects/my-app"
  const normalized = normalize(folderAccess);
  if (!normalized.startsWith("projects")) return null;
  const resolved = resolve(projectsWorkspace, "..", normalized);
  if (resolved !== projectsWorkspace && !resolved.startsWith(projectsWorkspace + sep)) return null;
  return resolved;
}
