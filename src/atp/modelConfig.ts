/**
 * ModelConfig — per-agent model overrides and provider priority management.
 *
 * Reads ALL providers and models from @mariozechner/pi-ai's generated registry.
 * Persists to data/model-config.json. Agents without overrides use the
 * primary model (from config/env). Supports primary/secondary/fallback tiers.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { config } from "../config.js";
// pi-ai's generated model registry — the single source of truth
import { MODELS } from "@mariozechner/pi-ai/dist/models.generated.js";
import { getEnvApiKey } from "@mariozechner/pi-ai/dist/env-api-keys.js";
import type { Model } from "@mariozechner/pi-ai/dist/types.js";

const CONFIG_PATH = join(config.dataDir, "model-config.json");
const KEYS_PATH = join(config.dataDir, "api-keys.json");

// ── Provider display names ──────────────────────────────────────────────────

const PROVIDER_LABELS: Record<string, string> = {
  ollama: "Ollama (Local)",
  "amazon-bedrock": "Amazon Bedrock",
  anthropic: "Anthropic",
  "azure-openai-responses": "Azure OpenAI",
  cerebras: "Cerebras",
  "github-copilot": "GitHub Copilot",
  google: "Google Gemini",
  "google-antigravity": "Google Antigravity",
  "google-gemini-cli": "Gemini CLI",
  "google-vertex": "Google Vertex AI",
  groq: "Groq",
  huggingface: "Hugging Face",
  "kimi-coding": "Kimi Coding",
  minimax: "MiniMax",
  "minimax-cn": "MiniMax CN",
  mistral: "Mistral",
  openai: "OpenAI",
  "openai-codex": "OpenAI Codex",
  opencode: "OpenCode",
  openrouter: "OpenRouter",
  "vercel-ai-gateway": "Vercel AI Gateway",
  xai: "xAI (Grok)",
  zai: "ZhipuAI (GLM)",
};

// Env var hints for display in the UI (matches pi-ai's getEnvApiKey)
const ENV_KEY_HINTS: Record<string, string> = {
  "amazon-bedrock": "AWS_ACCESS_KEY_ID",
  anthropic: "ANTHROPIC_API_KEY",
  "azure-openai-responses": "AZURE_OPENAI_API_KEY",
  cerebras: "CEREBRAS_API_KEY",
  "github-copilot": "GITHUB_TOKEN",
  google: "GEMINI_API_KEY",
  "google-antigravity": "GEMINI_API_KEY",
  "google-gemini-cli": "GEMINI_API_KEY",
  "google-vertex": "GOOGLE_APPLICATION_CREDENTIALS",
  groq: "GROQ_API_KEY",
  huggingface: "HF_TOKEN",
  "kimi-coding": "KIMI_API_KEY",
  minimax: "MINIMAX_API_KEY",
  "minimax-cn": "MINIMAX_CN_API_KEY",
  mistral: "MISTRAL_API_KEY",
  openai: "OPENAI_API_KEY",
  "openai-codex": "OPENAI_API_KEY",
  opencode: "OPENCODE_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
  "vercel-ai-gateway": "AI_GATEWAY_API_KEY",
  xai: "XAI_API_KEY",
  zai: "ZAI_API_KEY",
};

// ── Provider icon domains (gstatic colored favicon service) ─────────────────

const PROVIDER_ICON_DOMAINS: Record<string, string> = {
  ollama: "ollama.com",
  "amazon-bedrock": "aws.amazon.com",
  anthropic: "anthropic.com",
  "azure-openai-responses": "azure.microsoft.com",
  cerebras: "cerebras.ai",
  "github-copilot": "github.com",
  google: "gemini.google.com",
  "google-antigravity": "google.com",
  "google-gemini-cli": "gemini.google.com",
  "google-vertex": "cloud.google.com",
  groq: "groq.com",
  huggingface: "huggingface.co",
  "kimi-coding": "kimi.moonshot.cn",
  minimax: "minimaxi.com",
  "minimax-cn": "minimaxi.com",
  mistral: "mistral.ai",
  openai: "openai.com",
  "openai-codex": "openai.com",
  opencode: "openai.com",
  openrouter: "openrouter.ai",
  "vercel-ai-gateway": "vercel.com",
  xai: "x.ai",
  zai: "zhipuai.cn",
};

// ── Provider detection ───────────────────────────────────────────────────────

export interface ProviderInfo {
  id: string;
  name: string;
  configured: boolean;
  envKey: string;
  models: string[];
  iconUrl: string;
  baseUrl?: string;
}

export interface OllamaConfig {
  baseUrl: string;
  models: string[];
}

/** Build the full provider list dynamically from pi-ai's model registry. */
export function getProviders(): ProviderInfo[] {
  const providerIds = Object.keys(MODELS as Record<string, Record<string, unknown>>);
  const result: ProviderInfo[] = providerIds.map((id) => {
    const modelsMap = (MODELS as Record<string, Record<string, unknown>>)[id] ?? {};
    const modelIds = Object.keys(modelsMap);
    const configured = !!getEnvApiKey(id);
    const domain = PROVIDER_ICON_DOMAINS[id];
    const iconUrl = domain
      ? `https://t2.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://${domain}&size=32`
      : `/icons/providers/${id}.svg`;
    return {
      id,
      name: PROVIDER_LABELS[id] ?? id,
      configured,
      envKey: ENV_KEY_HINTS[id] ?? "",
      models: modelIds,
      iconUrl,
    };
  });

  // Append synthetic Ollama entry — not in pi-ai registry, managed locally
  const ollama = store.ollamaConfig;
  result.push({
    id: "ollama",
    name: "Ollama (Local)",
    configured: !!(ollama && ollama.models.length > 0),
    envKey: "",
    models: ollama?.models ?? [],
    iconUrl: `https://t2.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://ollama.com&size=32`,
    baseUrl: ollama?.baseUrl ?? "http://localhost:11434",
  });

  return result;
}

// ── Config types ─────────────────────────────────────────────────────────────

export interface ModelSlot {
  provider: string;
  model: string;
}

export interface ModelConfigStore {
  primary: ModelSlot;
  secondary: ModelSlot | null;
  fallback: ModelSlot | null;
  agentModels: Record<string, ModelSlot>;
  ollamaConfig?: OllamaConfig;
}

// ── Load / Save ──────────────────────────────────────────────────────────────

function defaultConfig(): ModelConfigStore {
  return {
    primary: { provider: config.modelProvider, model: config.model },
    secondary: null,
    fallback: null,
    agentModels: {},
  };
}

let store: ModelConfigStore = loadConfig();

function loadConfig(): ModelConfigStore {
  try {
    if (existsSync(CONFIG_PATH)) {
      const raw = JSON.parse(readFileSync(CONFIG_PATH, "utf-8"));
      return {
        primary: raw.primary ?? { provider: config.modelProvider, model: config.model },
        secondary: raw.secondary ?? null,
        fallback: raw.fallback ?? null,
        agentModels: raw.agentModels ?? {},
        ollamaConfig: raw.ollamaConfig ?? undefined,
      };
    }
  } catch { /* ignore */ }
  return defaultConfig();
}

function saveConfig(): void {
  try {
    mkdirSync(config.dataDir, { recursive: true });
    writeFileSync(CONFIG_PATH, JSON.stringify(store, null, 2));
  } catch { /* best-effort */ }
}

// ── Public API ───────────────────────────────────────────────────────────────

export function getModelConfig(): ModelConfigStore {
  return store;
}

export function setModelConfig(cfg: Partial<ModelConfigStore>): void {
  if (cfg.primary) store.primary = cfg.primary;
  if (cfg.secondary !== undefined) store.secondary = cfg.secondary;
  if (cfg.fallback !== undefined) store.fallback = cfg.fallback;
  if (cfg.agentModels !== undefined) store.agentModels = cfg.agentModels;
  saveConfig();
}

export function setAgentModel(agentId: string, slot: ModelSlot | null): void {
  if (slot) {
    store.agentModels[agentId] = slot;
  } else {
    delete store.agentModels[agentId];
  }
  saveConfig();
}

/** Get the effective model for an agent (override or primary). */
export function getEffectiveModel(agentId: string): ModelSlot {
  return store.agentModels[agentId] ?? store.primary;
}

/**
 * Returns true if the provider for the given agent has a usable API key
 * (or requires no key, like Ollama). Used to skip agent prompts when the
 * provider is not configured, preventing "No API key for provider: X" crashes.
 */
export function isProviderReady(agentId: string): boolean {
  const slot = getEffectiveModel(agentId);
  if (slot.provider === "ollama") return true;
  const envVar = ENV_KEY_HINTS[slot.provider];
  if (!envVar) return true; // unknown provider — let it try
  return !!(process.env[envVar]);
}

export function resetModelConfig(): void {
  store = defaultConfig();
  saveConfig();
}

export function getOllamaConfig(): OllamaConfig | null {
  return store.ollamaConfig ?? null;
}

export function setOllamaConfig(cfg: OllamaConfig): void {
  store.ollamaConfig = cfg;
  saveConfig();
}

/** Build a Model<"openai-completions"> object for Ollama (not in pi-ai's static registry). */
export function buildOllamaModel(modelId: string, baseUrl?: string): Model<"openai-completions"> {
  const url = (baseUrl ?? store.ollamaConfig?.baseUrl ?? "http://localhost:11434").replace(/\/$/, "");
  return {
    id: modelId,
    name: modelId,
    api: "openai-completions",
    provider: "ollama",
    baseUrl: `${url}/v1`,
    reasoning: false,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128000,
    maxTokens: 32000,
    compat: {
      supportsStore: false,
      supportsDeveloperRole: false,
      supportsReasoningEffort: false,
    },
  };
}

// ── API Key store ─────────────────────────────────────────────────────────────

function loadApiKeys(): Record<string, string> {
  try {
    if (existsSync(KEYS_PATH)) {
      return JSON.parse(readFileSync(KEYS_PATH, "utf-8"));
    }
  } catch { /* ignore */ }
  return {};
}

/** Inject stored API keys into process.env so getEnvApiKey() picks them up. */
export function injectStoredApiKeys(): void {
  const keys = loadApiKeys();
  for (const [provider, key] of Object.entries(keys)) {
    const envVar = ENV_KEY_HINTS[provider];
    if (envVar && key) {
      process.env[envVar] = key;
    }
  }
}

/** Set (or clear) a provider API key — persists to disk and injects into env. */
export function setProviderApiKey(providerId: string, apiKey: string): void {
  const keys = loadApiKeys();
  const envVar = ENV_KEY_HINTS[providerId];
  if (!envVar) return;
  if (apiKey) {
    keys[providerId] = apiKey;
    process.env[envVar] = apiKey;
  } else {
    delete keys[providerId];
    delete process.env[envVar];
  }
  try {
    mkdirSync(config.dataDir, { recursive: true });
    writeFileSync(KEYS_PATH, JSON.stringify(keys, null, 2));
  } catch { /* best-effort */ }
}

/** Return a masked version of a stored key (for UI display), or null if none. */
export function getProviderKeyMask(providerId: string): string | null {
  const keys = loadApiKeys();
  const key = keys[providerId];
  if (!key) return null;
  if (key.length <= 8) return "****";
  return key.slice(0, 4) + "..." + key.slice(-4);
}

/** Look up per-model cost rates (USD per 1M tokens) from the pi-ai registry. */
export function getModelCostRates(provider: string, modelId: string): {
  inputPerM: number; outputPerM: number; cacheReadPerM: number;
} | null {
  const m = (MODELS as Record<string, Record<string, any>>)[provider]?.[modelId];
  if (!m?.cost) return null;
  return { inputPerM: m.cost.input, outputPerM: m.cost.output, cacheReadPerM: m.cost.cacheRead ?? 0 };
}

// Inject stored keys on module load (before config is used)
injectStoredApiKeys();
