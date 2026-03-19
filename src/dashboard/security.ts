/**
 * Dashboard security middleware — auth, CORS, headers, rate limiting.
 *
 * Dual auth: JWT httpOnly cookies (primary) + legacy API key (fallback for SSE).
 * On first run, generates a random 32-byte hex key → data/dashboard-secret.key.
 */

import { randomBytes, existsSync, readFileSync, writeFileSync, mkdirSync } from "./securityHelpers.js";
import { join } from "path";
import { config } from "../config.js";
import type { Request, Response, NextFunction } from "express";
import { verifyAccessToken, ACCESS_COOKIE } from "./auth.js";

// ── API Key Management ────────────────────────────────────────────────────

const KEY_FILE = join(config.dataDir, "dashboard-secret.key");

function ensureApiKey(): string {
  mkdirSync(config.dataDir);

  if (existsSync(KEY_FILE)) {
    const existing = readFileSync(KEY_FILE).trim();
    if (existing.length >= 32) return existing;
  }

  const key = randomBytes(32);
  writeFileSync(KEY_FILE, key);
  return key;
}

let _apiKey: string | null = null;

/** Get or generate the dashboard API key. */
export function getDashboardApiKey(): string {
  if (!_apiKey) _apiKey = ensureApiKey();
  return _apiKey;
}

/**
 * Express middleware: dual authentication.
 * 1. JWT cookie (primary) — set by /api/auth/login
 * 2. Legacy API key via X-API-Key header or ?key= query param (fallback for SSE)
 *
 * Auth endpoints (/api/auth/*) are exempt.
 */
export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Let SPA and static assets through
  if (!req.path.startsWith("/api/")) { next(); return; }

  // Auth endpoints don't need auth
  if (req.path.startsWith("/api/auth/")) { next(); return; }

  // 1. Try JWT cookie
  const token = req.cookies?.[ACCESS_COOKIE];
  if (token && verifyAccessToken(token)) { next(); return; }

  // 2. Fallback: legacy API key (for SSE EventSource + backward compat)
  const key = getDashboardApiKey();
  const provided =
    (req.headers["x-api-key"] as string) ??
    (req.query.key as string) ??
    (req.query.KEY as string) ??
    "";

  if (provided === key) { next(); return; }

  res.status(401).json({ error: "Unauthorized" });
}

// ── CORS Configuration ───────────────────────────────────────────────────

export function getCorsOptions() {
  const allowedOrigin = process.env.VEC_CORS_ORIGIN ?? `http://localhost:${config.dashboardPort}`;
  return {
    origin: allowedOrigin,
    methods: ["GET", "POST", "DELETE", "PATCH"],
    allowedHeaders: ["Content-Type", "X-API-Key"],
    credentials: true, // required for httpOnly cookies
  };
}

// ── Helmet / Security Headers ────────────────────────────────────────────

export function getHelmetOptions() {
  return {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "blob:"],
        scriptSrcElem: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "blob:"],
        workerSrc: ["'self'", "blob:"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        styleSrcElem: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        imgSrc: ["'self'", "data:", "blob:", "https://t2.gstatic.com"],
        connectSrc: ["'self'", "ws:", "wss:"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        frameSrc: ["'self'", "data:", "blob:"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
      },
    },
    crossOriginEmbedderPolicy: false,
  };
}

// ── Rate Limiting ────────────────────────────────────────────────────────

export function getMutationRateLimitOptions() {
  return {
    windowMs: 60 * 1000,
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many requests — slow down" },
  };
}

/** Strict rate limit for auth login attempts — 5 per minute. */
export function getLoginRateLimitOptions() {
  return {
    windowMs: 60 * 1000,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many login attempts — try again in a minute" },
  };
}

// ── Dashboard Host ───────────────────────────────────────────────────────

export function getDashboardHost(): string {
  return process.env.VEC_DASHBOARD_HOST ?? "127.0.0.1";
}

// ── MCP Config Validation ────────────────────────────────────────────────

const MCP_ALLOWED_COMMANDS = new Set([
  "npx", "node", "python", "python3", "docker", "deno", "bun", "uvx",
]);

const MCP_BLOCKED_ARG_PATTERNS = [
  /[;&|`$]/,
  />\s*\//,
  /\.\.[/\\]/,
];

export interface MCPValidationResult {
  valid: boolean;
  error?: string;
}

export function validateMCPConfig(body: any): MCPValidationResult {
  if (!body || typeof body !== "object" || !body.mcpServers) {
    return { valid: false, error: "Missing mcpServers object" };
  }

  if (typeof body.mcpServers !== "object" || Array.isArray(body.mcpServers)) {
    return { valid: false, error: "mcpServers must be an object" };
  }

  for (const [name, serverCfg] of Object.entries(body.mcpServers)) {
    const cfg = serverCfg as any;

    if (!cfg || typeof cfg !== "object") {
      return { valid: false, error: `Server "${name}": config must be an object` };
    }

    if (!cfg.command || typeof cfg.command !== "string") {
      return { valid: false, error: `Server "${name}": command is required (string)` };
    }

    const cmd = cfg.command.trim().toLowerCase();
    const cmdBase = cmd.split(/[/\\]/).pop() ?? cmd;
    const cmdClean = cmdBase.replace(/\.(exe|cmd|bat)$/i, "");

    if (!MCP_ALLOWED_COMMANDS.has(cmdClean)) {
      return {
        valid: false,
        error: `Server "${name}": command "${cfg.command}" is not allowed. Allowed: ${[...MCP_ALLOWED_COMMANDS].join(", ")}`,
      };
    }

    if (cfg.args !== undefined) {
      if (!Array.isArray(cfg.args)) {
        return { valid: false, error: `Server "${name}": args must be an array of strings` };
      }
      for (const arg of cfg.args) {
        if (typeof arg !== "string") {
          return { valid: false, error: `Server "${name}": all args must be strings` };
        }
        for (const pattern of MCP_BLOCKED_ARG_PATTERNS) {
          if (pattern.test(arg)) {
            return { valid: false, error: `Server "${name}": blocked argument pattern detected in "${arg}"` };
          }
        }
      }
    }

    if (cfg.env !== undefined) {
      if (typeof cfg.env !== "object" || Array.isArray(cfg.env)) {
        return { valid: false, error: `Server "${name}": env must be an object` };
      }
      for (const [k, v] of Object.entries(cfg.env)) {
        if (typeof v !== "string") {
          return { valid: false, error: `Server "${name}": env value for "${k}" must be a string` };
        }
      }
    }
  }

  return { valid: true };
}
