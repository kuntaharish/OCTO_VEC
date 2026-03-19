/**
 * JWT auth module — issues access + refresh tokens via httpOnly cookies.
 *
 * Master key: stored hashed (SHA-256) in data/dashboard-secret.key
 * JWT secrets: separate random keys in data/jwt-*.key
 */

import jwt from "jsonwebtoken";
import { join } from "path";
import { config } from "../config.js";
import { randomBytes, existsSync, readFileSync, writeFileSync, mkdirSync } from "./securityHelpers.js";
import crypto from "crypto";
import type { Response } from "express";

// ── Constants ────────────────────────────────────────────────────────────────

const ACCESS_EXPIRY = "1h";
const REFRESH_EXPIRY = "7d";
const ACCESS_COOKIE = "vec_access";
const REFRESH_COOKIE = "vec_refresh";

// ── Key files ────────────────────────────────────────────────────────────────

const JWT_SECRET_FILE = join(config.dataDir, "jwt-secret.key");
const REFRESH_SECRET_FILE = join(config.dataDir, "jwt-refresh-secret.key");

function ensureFile(path: string, len = 32): string {
  mkdirSync(config.dataDir);
  if (existsSync(path)) {
    const v = readFileSync(path).trim();
    if (v.length >= 32) return v;
  }
  const key = randomBytes(len);
  writeFileSync(path, key);
  return key;
}

let _jwtSecret: string | null = null;
let _refreshSecret: string | null = null;

function jwtSecret(): string {
  if (!_jwtSecret) _jwtSecret = ensureFile(JWT_SECRET_FILE);
  return _jwtSecret;
}

function refreshSecret(): string {
  if (!_refreshSecret) _refreshSecret = ensureFile(REFRESH_SECRET_FILE);
  return _refreshSecret;
}

// ── Master key validation ────────────────────────────────────────────────────

export function hashKey(key: string): string {
  return crypto.createHash("sha256").update(key).digest("hex");
}

export function validateMasterKey(input: string, storedKey: string): boolean {
  // Constant-time comparison
  const a = Buffer.from(input);
  const b = Buffer.from(storedKey);
  if (a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

// ── Token operations ─────────────────────────────────────────────────────────

export function signAccessToken(): string {
  return jwt.sign({ type: "access" }, jwtSecret(), { expiresIn: ACCESS_EXPIRY });
}

export function signRefreshToken(): string {
  return jwt.sign({ type: "refresh" }, refreshSecret(), { expiresIn: REFRESH_EXPIRY });
}

export function verifyAccessToken(token: string): jwt.JwtPayload | null {
  try {
    const payload = jwt.verify(token, jwtSecret());
    if (typeof payload === "object" && payload.type === "access") return payload;
    return null;
  } catch {
    return null;
  }
}

export function verifyRefreshToken(token: string): jwt.JwtPayload | null {
  try {
    const payload = jwt.verify(token, refreshSecret());
    if (typeof payload === "object" && payload.type === "refresh") return payload;
    return null;
  } catch {
    return null;
  }
}

// ── Cookie helpers ───────────────────────────────────────────────────────────

export function setAuthCookies(res: Response): void {
  const access = signAccessToken();
  const refresh = signRefreshToken();

  const common = {
    httpOnly: true,
    sameSite: "strict" as const,
    secure: false, // localhost — set true behind HTTPS proxy
    path: "/",
  };

  res.cookie(ACCESS_COOKIE, access, { ...common, maxAge: 60 * 60 * 1000 }); // 1h
  res.cookie(REFRESH_COOKIE, refresh, { ...common, maxAge: 7 * 24 * 60 * 60 * 1000 }); // 7d
}

export function clearAuthCookies(res: Response): void {
  const common = { httpOnly: true, sameSite: "strict" as const, secure: false, path: "/" };
  res.clearCookie(ACCESS_COOKIE, common);
  res.clearCookie(REFRESH_COOKIE, common);
}

export { ACCESS_COOKIE, REFRESH_COOKIE };
