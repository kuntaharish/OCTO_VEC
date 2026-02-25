/**
 * Persistent conversation history for VEC agents.
 *
 * Saves each agent's AgentMessage[] to disk after every prompt and reloads it
 * on next startup so agents pick up where they left off.
 *
 * Storage: data/agent-history/{agentId}.json
 *
 * Agents that call clearHistory() keep in-memory history clear, but the disk
 * file is NOT wiped (only an explicit clearAgentHistory() call does that).
 * This means after a restart the last known state is always recovered.
 */

import fs from "fs";
import path from "path";
import { config } from "../config.js";
import type { AgentMessage } from "@mariozechner/pi-agent-core";

const HISTORY_DIR = path.join(config.dataDir, "agent-history");

function historyPath(agentId: string): string {
  return path.join(HISTORY_DIR, `${agentId}.json`);
}

/**
 * Persist an agent's message history to disk.
 * Called after each successful agent.prompt() completes (via agent_end event).
 */
export function saveAgentHistory(agentId: string, messages: AgentMessage[]): void {
  try {
    fs.mkdirSync(HISTORY_DIR, { recursive: true });
    fs.writeFileSync(historyPath(agentId), JSON.stringify(messages), "utf-8");
  } catch {
    // Non-fatal — never let a save failure crash the agent loop
  }
}

/**
 * Load a previously saved message history for an agent.
 * Returns an empty array if no history exists or if the file is corrupt.
 */
export function loadAgentHistory(agentId: string): AgentMessage[] {
  try {
    const raw = fs.readFileSync(historyPath(agentId), "utf-8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as AgentMessage[]) : [];
  } catch {
    return [];
  }
}

/**
 * Delete the saved history for an agent (e.g. user-triggered /forget).
 */
export function clearAgentHistory(agentId: string): void {
  try {
    const p = historyPath(agentId);
    if (fs.existsSync(p)) fs.unlinkSync(p);
  } catch {
    // Non-fatal
  }
}
