/**
 * JSON-backed storage for integration credentials & settings.
 * Follows the same pattern as channelConfig.ts.
 *
 * Covers: SearXNG, SonarQube, Gitleaks, Semgrep, Trivy, post-task scans toggle.
 *
 * Security:
 * - Raw tokens stored in data/integration-config.json (in USER_DATA_DIR, gitignored)
 * - getMaskedIntegrationConfig() returns masked tokens for UI display
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import { config } from "../config.js";
import { log } from "../atp/logger.js";

const L = log.for("integrationConfig");

const CONFIG_PATH = join(config.dataDir, "integration-config.json");

// ── Types ────────────────────────────────────────────────────────────────────

export interface SearxngConfig {
  url: string;
  enabled: boolean;
}

export interface SonarqubeConfig {
  hostUrl: string;
  token: string;
  projectBaseKey: string;
  scannerImage: string;
  enabled: boolean;
}

export interface ScannerConfig {
  image: string;
  enabled: boolean;
}

export interface IntegrationConfig {
  searxng?: SearxngConfig;
  sonarqube?: SonarqubeConfig;
  gitleaks?: ScannerConfig;
  semgrep?: ScannerConfig;
  trivy?: ScannerConfig;
  postTaskScansEnabled?: boolean;
}

export interface MaskedIntegrationInfo {
  searxng: { configured: boolean; enabled: boolean; url: string };
  sonarqube: { configured: boolean; enabled: boolean; hostUrl: string; token: string | null; projectBaseKey: string; scannerImage: string };
  gitleaks: { configured: boolean; enabled: boolean; image: string };
  semgrep: { configured: boolean; enabled: boolean; image: string };
  trivy: { configured: boolean; enabled: boolean; image: string };
  postTaskScansEnabled: boolean;
}

// ── Masking ──────────────────────────────────────────────────────────────────

function maskToken(token: string | undefined): string | null {
  if (!token) return null;
  if (token.length <= 8) return "****";
  return token.slice(0, 4) + "****" + token.slice(-4);
}

// ── Storage ──────────────────────────────────────────────────────────────────

export function loadIntegrationConfig(): IntegrationConfig {
  try {
    if (!existsSync(CONFIG_PATH)) return {};
    const raw = readFileSync(CONFIG_PATH, "utf-8").trim();
    return raw ? JSON.parse(raw) : {};
  } catch (err) {
    L.error("Failed to load integration config — all integrations disabled until fixed", err, { path: CONFIG_PATH });
    return {};
  }
}

function saveRaw(cfg: IntegrationConfig): void {
  mkdirSync(config.dataDir, { recursive: true });
  writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2), "utf-8");
}

/**
 * Save integration config. Merges with existing config.
 * Also injects relevant values into process.env and mutates config object.
 */
export function saveIntegrationConfig(updates: Partial<IntegrationConfig>): void {
  const cfg = loadIntegrationConfig();

  if (updates.searxng !== undefined) {
    cfg.searxng = updates.searxng;
    if (updates.searxng) {
      process.env.SEARXNG_URL = updates.searxng.url;
      (config as any).searxngUrl = updates.searxng.url;
    }
  }

  if (updates.sonarqube !== undefined) {
    cfg.sonarqube = updates.sonarqube;
    if (updates.sonarqube) {
      process.env.SONAR_HOST_URL = updates.sonarqube.hostUrl;
      process.env.SONAR_TOKEN = updates.sonarqube.token;
      process.env.SONAR_PROJECT_BASE_KEY = updates.sonarqube.projectBaseKey;
      process.env.SONAR_SCANNER_IMAGE = updates.sonarqube.scannerImage;
      (config as any).sonarHostUrl = updates.sonarqube.hostUrl;
      (config as any).sonarToken = updates.sonarqube.token;
      (config as any).sonarProjectBaseKey = updates.sonarqube.projectBaseKey;
      (config as any).sonarScannerImage = updates.sonarqube.scannerImage;
    }
  }

  if (updates.gitleaks !== undefined) cfg.gitleaks = updates.gitleaks;
  if (updates.semgrep !== undefined) cfg.semgrep = updates.semgrep;
  if (updates.trivy !== undefined) cfg.trivy = updates.trivy;

  if (updates.postTaskScansEnabled !== undefined) {
    cfg.postTaskScansEnabled = updates.postTaskScansEnabled;
    (config as any).postTaskScansEnabled = updates.postTaskScansEnabled;
  }

  saveRaw(cfg);
}

/**
 * Load saved integration config into process.env and config object on startup.
 * JSON file takes precedence over .env if both are set.
 */
export function injectIntegrationEnv(): void {
  const cfg = loadIntegrationConfig();

  if (cfg.searxng?.url) {
    process.env.SEARXNG_URL = cfg.searxng.url;
    (config as any).searxngUrl = cfg.searxng.url;
  }

  if (cfg.sonarqube) {
    if (cfg.sonarqube.hostUrl) {
      process.env.SONAR_HOST_URL = cfg.sonarqube.hostUrl;
      (config as any).sonarHostUrl = cfg.sonarqube.hostUrl;
    }
    if (cfg.sonarqube.token) {
      process.env.SONAR_TOKEN = cfg.sonarqube.token;
      (config as any).sonarToken = cfg.sonarqube.token;
    }
    if (cfg.sonarqube.projectBaseKey) {
      process.env.SONAR_PROJECT_BASE_KEY = cfg.sonarqube.projectBaseKey;
      (config as any).sonarProjectBaseKey = cfg.sonarqube.projectBaseKey;
    }
    if (cfg.sonarqube.scannerImage) {
      process.env.SONAR_SCANNER_IMAGE = cfg.sonarqube.scannerImage;
      (config as any).sonarScannerImage = cfg.sonarqube.scannerImage;
    }
  }

  if (cfg.postTaskScansEnabled !== undefined) {
    (config as any).postTaskScansEnabled = cfg.postTaskScansEnabled;
  }
}

/**
 * Return integration config with tokens masked. Safe to send to the browser.
 */
export function getMaskedIntegrationConfig(): MaskedIntegrationInfo {
  const cfg = loadIntegrationConfig();

  return {
    searxng: {
      configured: !!cfg.searxng?.url,
      enabled: cfg.searxng?.enabled ?? !!config.searxngUrl,
      url: cfg.searxng?.url ?? config.searxngUrl ?? "",
    },
    sonarqube: {
      configured: !!(cfg.sonarqube?.token || config.sonarToken),
      enabled: cfg.sonarqube?.enabled ?? !!config.sonarToken,
      hostUrl: cfg.sonarqube?.hostUrl ?? config.sonarHostUrl ?? "http://localhost:9000",
      token: maskToken(cfg.sonarqube?.token || config.sonarToken || undefined),
      projectBaseKey: cfg.sonarqube?.projectBaseKey ?? config.sonarProjectBaseKey ?? "vec",
      scannerImage: cfg.sonarqube?.scannerImage ?? config.sonarScannerImage ?? "sonarsource/sonar-scanner-cli:latest",
    },
    gitleaks: {
      configured: true,
      enabled: cfg.gitleaks?.enabled ?? true,
      image: cfg.gitleaks?.image ?? "zricethezav/gitleaks:latest",
    },
    semgrep: {
      configured: true,
      enabled: cfg.semgrep?.enabled ?? true,
      image: cfg.semgrep?.image ?? "semgrep/semgrep",
    },
    trivy: {
      configured: true,
      enabled: cfg.trivy?.enabled ?? true,
      image: cfg.trivy?.image ?? "aquasec/trivy:latest",
    },
    postTaskScansEnabled: cfg.postTaskScansEnabled ?? config.postTaskScansEnabled,
  };
}
