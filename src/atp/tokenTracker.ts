/**
 * TokenTracker — tracks per-agent token usage from stream events.
 *
 * Estimates token counts from streamed text (≈4 chars per token).
 * Accumulates per-agent stats: turns, estimated input/output tokens,
 * and estimated cost based on configurable pricing.
 *
 * Persists to data/token-usage.json so stats survive restarts.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { config } from "../config.js";

const USAGE_PATH = join(config.dataDir, "token-usage.json");
const BUDGET_PATH = join(config.dataDir, "budget-config.json");

// ── Fallback pricing (USD per 1M tokens) ─────────────────────────────────────
// Used only when real per-model cost data isn't available from the provider.
const FALLBACK_INPUT_PER_M = parseFloat(process.env.VEC_INPUT_COST_PER_M ?? "0.50");
const FALLBACK_OUTPUT_PER_M = parseFloat(process.env.VEC_OUTPUT_COST_PER_M ?? "1.50");

// ── Per-agent accumulator ────────────────────────────────────────────────────

export interface AgentUsage {
  agentId: string;
  turns: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  costUsd: number;
  lastActivity: string;  // ISO timestamp
  model?: string;        // last model used (e.g. "claude-sonnet-4-20250514")
}

interface UsageStore {
  agents: Record<string, AgentUsage>;
  sessionStart: string;
}

// ── In-memory state ──────────────────────────────────────────────────────────

let store: UsageStore = loadStore();

// Track chars accumulated during current turn (per agent)
const _turnChars: Record<string, number> = {};

function loadStore(): UsageStore {
  try {
    if (existsSync(USAGE_PATH)) {
      return JSON.parse(readFileSync(USAGE_PATH, "utf-8"));
    }
  } catch { /* ignore corrupt file */ }
  return { agents: {}, sessionStart: new Date().toISOString() };
}

function saveStore(): void {
  try {
    mkdirSync(config.dataDir, { recursive: true });
    writeFileSync(USAGE_PATH, JSON.stringify(store, null, 2));
  } catch { /* best-effort persist */ }
}

function ensureAgent(agentId: string): AgentUsage {
  if (!store.agents[agentId]) {
    store.agents[agentId] = {
      agentId,
      turns: 0,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      costUsd: 0,
      lastActivity: new Date().toISOString(),
    };
  }
  return store.agents[agentId];
}

function charsToTokens(chars: number): number {
  return Math.ceil(chars / 4);
}

function computeCostUsd(
  inputTokens: number,
  outputTokens: number,
  inputPerM = FALLBACK_INPUT_PER_M,
  outputPerM = FALLBACK_OUTPUT_PER_M,
): number {
  return (inputTokens * inputPerM + outputTokens * outputPerM) / 1_000_000;
}

// ── Public API ───────────────────────────────────────────────────────────────

/** Call when an agent starts a turn. */
export function trackTurnStart(agentId: string): void {
  _turnChars[agentId] = 0;
}

/** Call with each text/thinking delta to accumulate output chars. */
export function trackOutputChars(agentId: string, chars: number): void {
  _turnChars[agentId] = (_turnChars[agentId] ?? 0) + chars;
}

/** Call when an agent finishes a turn. Uses real usage data if provided, else estimates. */
export function trackTurnEnd(agentId: string, opts?: {
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  costUsd?: number;
  inputCostPerM?: number;
  outputCostPerM?: number;
}): void {
  const agent = ensureAgent(agentId);

  let inputTokens: number;
  let outputTokens: number;
  let cost: number;

  if (opts?.inputTokens != null && opts?.outputTokens != null) {
    // Real usage data from the provider
    inputTokens = opts.inputTokens;
    outputTokens = opts.outputTokens;
    cost = opts.costUsd != null
      ? opts.costUsd
      : computeCostUsd(inputTokens, outputTokens, opts.inputCostPerM, opts.outputCostPerM);
  } else {
    // Fallback: estimate from streamed chars
    const outputChars = _turnChars[agentId] ?? 0;
    outputTokens = charsToTokens(outputChars);
    inputTokens = Math.ceil(outputTokens * 2.5);
    cost = computeCostUsd(inputTokens, outputTokens);
  }

  agent.turns += 1;
  agent.outputTokens += outputTokens;
  agent.inputTokens += inputTokens;
  agent.totalTokens += inputTokens + outputTokens;
  agent.costUsd += cost;
  agent.lastActivity = new Date().toISOString();
  if (opts?.model) agent.model = opts.model;

  delete _turnChars[agentId];
  saveStore();
}

/** Get usage for all agents. */
export function getAllUsage(): AgentUsage[] {
  return Object.values(store.agents);
}

/** Get aggregate totals. */
export function getTotals(): {
  totalTurns: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;
  totalCostUsd: number;
  sessionStart: string;
} {
  const agents = Object.values(store.agents);
  return {
    totalTurns: agents.reduce((s, a) => s + a.turns, 0),
    totalInputTokens: agents.reduce((s, a) => s + a.inputTokens, 0),
    totalOutputTokens: agents.reduce((s, a) => s + a.outputTokens, 0),
    totalTokens: agents.reduce((s, a) => s + a.totalTokens, 0),
    totalCostUsd: agents.reduce((s, a) => s + a.costUsd, 0),
    sessionStart: store.sessionStart,
  };
}

/** Reset all usage data. */
export function resetUsage(): void {
  store = { agents: {}, sessionStart: new Date().toISOString() };
  saveStore();
}

// ── Budget System ────────────────────────────────────────────────────────────

export interface LimitConfig {
  dailyLimit?: number;   // USD
  monthlyLimit?: number; // USD
  enabled: boolean;
}

export interface BudgetConfig {
  org: LimitConfig & { alertThreshold: number };
  departments: Record<string, LimitConfig>;
  agents: Record<string, LimitConfig>;
}

interface DailySpend {
  date: string; // YYYY-MM-DD
  org: number;
  agents: Record<string, number>;
}

let budgetConfig: BudgetConfig = loadBudgetConfig();

// Track daily/monthly spend from usage data
function loadBudgetConfig(): BudgetConfig {
  try {
    if (existsSync(BUDGET_PATH)) {
      return JSON.parse(readFileSync(BUDGET_PATH, "utf-8"));
    }
  } catch { /* ignore */ }
  return {
    org: { enabled: false, alertThreshold: 0.8 },
    departments: {},
    agents: {},
  };
}

function saveBudgetConfig(): void {
  try {
    mkdirSync(config.dataDir, { recursive: true });
    writeFileSync(BUDGET_PATH, JSON.stringify(budgetConfig, null, 2));
  } catch { /* best-effort */ }
}

export function getBudgetConfig(): BudgetConfig {
  return budgetConfig;
}

export function setBudgetConfig(cfg: BudgetConfig): void {
  budgetConfig = cfg;
  saveBudgetConfig();
}

/** Compute daily spend from usage store for today. */
function getDailySpend(): DailySpend {
  const today = new Date().toISOString().slice(0, 10);
  // We estimate daily spend from per-agent totals proportionally
  // For precise daily tracking we'd need per-turn timestamps, so we track
  // cost accumulated since last reset as a proxy
  const agents: Record<string, number> = {};
  let org = 0;
  for (const a of Object.values(store.agents)) {
    // If lastActivity is today, count all cost (simplification)
    // In production you'd track per-day buckets
    const lastDate = a.lastActivity?.slice(0, 10);
    if (lastDate === today) {
      agents[a.agentId] = a.costUsd;
      org += a.costUsd;
    }
  }
  return { date: today, org, agents };
}

/** Get monthly spend (sum of all cost since session, capped to current month). */
function getMonthlySpend(): { org: number; agents: Record<string, number> } {
  const thisMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
  const agents: Record<string, number> = {};
  let org = 0;
  for (const a of Object.values(store.agents)) {
    const lastMonth = a.lastActivity?.slice(0, 7);
    if (lastMonth === thisMonth) {
      agents[a.agentId] = a.costUsd;
      org += a.costUsd;
    }
  }
  return { org, agents };
}

export interface LimitStatus {
  dailySpend: number;
  monthlySpend: number;
  dailyLimit?: number;
  monthlyLimit?: number;
  dailyPct: number;
  monthlyPct: number;
  exceeded: boolean;
  warning: boolean;
  enabled: boolean;
}

export interface BudgetStatus {
  org: LimitStatus & { alertThreshold: number };
  departments: Record<string, LimitStatus>;
  agents: Record<string, LimitStatus>;
}

// Helper to compute a department → agent mapping from an external roster
// The server will pass this in; tokenTracker doesn't know about employees
let _deptMap: Record<string, string> = {}; // agentId → department
export function setDepartmentMap(map: Record<string, string>) { _deptMap = map; }

function computeLimitStatus(spend: { daily: number; monthly: number }, lCfg: LimitConfig, threshold: number): LimitStatus {
  const dPct = lCfg.dailyLimit ? spend.daily / lCfg.dailyLimit : 0;
  const mPct = lCfg.monthlyLimit ? spend.monthly / lCfg.monthlyLimit : 0;
  const exceeded = lCfg.enabled && (
    (lCfg.dailyLimit != null && spend.daily >= lCfg.dailyLimit) ||
    (lCfg.monthlyLimit != null && spend.monthly >= lCfg.monthlyLimit)
  );
  const warning = lCfg.enabled && !exceeded && (dPct >= threshold || mPct >= threshold);
  return {
    dailySpend: spend.daily, monthlySpend: spend.monthly,
    dailyLimit: lCfg.dailyLimit, monthlyLimit: lCfg.monthlyLimit,
    dailyPct: dPct, monthlyPct: mPct,
    exceeded, warning, enabled: lCfg.enabled,
  };
}

/** Get current budget status with spend vs limits. */
export function getBudgetStatus(): BudgetStatus {
  const daily = getDailySpend();
  const monthly = getMonthlySpend();
  const cfg = budgetConfig;
  const threshold = cfg.org.alertThreshold || 0.8;

  // Org
  const orgStatus = {
    ...computeLimitStatus({ daily: daily.org, monthly: monthly.org }, cfg.org, threshold),
    alertThreshold: threshold,
  };

  // Departments — aggregate spend by department
  const deptDaily: Record<string, number> = {};
  const deptMonthly: Record<string, number> = {};
  for (const a of Object.values(store.agents)) {
    const dept = _deptMap[a.agentId] ?? "Other";
    deptDaily[dept] = (deptDaily[dept] ?? 0) + (daily.agents[a.agentId] ?? 0);
    deptMonthly[dept] = (deptMonthly[dept] ?? 0) + (monthly.agents[a.agentId] ?? 0);
  }
  const deptStatuses: Record<string, LimitStatus> = {};
  const allDepts = new Set([...Object.keys(cfg.departments ?? {}), ...Object.keys(deptDaily)]);
  for (const dept of allDepts) {
    const dCfg = cfg.departments?.[dept] ?? { enabled: false };
    deptStatuses[dept] = computeLimitStatus({
      daily: deptDaily[dept] ?? 0,
      monthly: deptMonthly[dept] ?? 0,
    }, dCfg, threshold);
  }

  // Agents
  const agentStatuses: Record<string, LimitStatus> = {};
  const allAgentIds = new Set([...Object.keys(cfg.agents), ...Object.keys(store.agents)]);
  for (const id of allAgentIds) {
    const aCfg = cfg.agents[id] ?? { enabled: false };
    agentStatuses[id] = computeLimitStatus({
      daily: daily.agents[id] ?? 0,
      monthly: monthly.agents[id] ?? 0,
    }, aCfg, threshold);
  }

  return { org: orgStatus, departments: deptStatuses, agents: agentStatuses };
}

/** Check if an agent is allowed to proceed (not over budget). */
export function isAgentOverBudget(agentId: string): { blocked: boolean; reason?: string } {
  const status = getBudgetStatus();

  // Check org level
  if (status.org.exceeded) {
    return { blocked: true, reason: "Organization budget limit exceeded" };
  }

  // Check agent level
  const agentStatus = status.agents[agentId];
  if (agentStatus?.exceeded) {
    return { blocked: true, reason: `Agent "${agentId}" budget limit exceeded` };
  }

  return { blocked: false };
}
