/**
 * API key resolver for pi-agent-core.
 *
 * Usage:
 *   new Agent({ getApiKey: apiKeyResolver() })
 *
 * Handles:
 * - Ollama: returns "ollama" placeholder (Ollama's OpenAI-compat API accepts any non-empty key)
 * - Codex OAuth: returns a refreshed OAuth token
 * - All other providers: returns undefined (pi-ai falls back to env vars)
 */
import { getOAuthApiKey } from "@mariozechner/pi-ai";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { config } from "../config.js";

const CREDS_PATH = join(config.dataDir, "codex-oauth.json");

function loadCreds(): Record<string, any> {
  if (!existsSync(CREDS_PATH)) {
    throw new Error(
      `Codex OAuth credentials not found at ${CREDS_PATH}.\n` +
      `See docs/config.md for Codex OAuth setup instructions.`
    );
  }
  return JSON.parse(readFileSync(CREDS_PATH, "utf8"));
}

/**
 * Returns a getApiKey resolver that handles Ollama and Codex OAuth.
 * Safe to always pass into new Agent({ getApiKey: ... }).
 */
export function codexApiKeyResolver(): (provider: string) => Promise<string | undefined> {
  const isCodex = config.modelProvider === "openai-codex";
  let creds: Record<string, any> | null = null;
  if (isCodex) creds = loadCreds();

  return async (provider: string) => {
    // Ollama doesn't use API keys — return a placeholder so pi-ai doesn't throw
    if (provider === "ollama") return "ollama";

    // Codex OAuth token refresh
    if (provider === "openai-codex" && creds) {
      const result = await getOAuthApiKey("openai-codex", creds);
      if (!result) return undefined;
      if (result.newCredentials !== creds["openai-codex"]) {
        creds = { ...creds, "openai-codex": result.newCredentials };
        writeFileSync(CREDS_PATH, JSON.stringify(creds, null, 2));
      }
      return result.apiKey;
    }

    return undefined;
  };
}
