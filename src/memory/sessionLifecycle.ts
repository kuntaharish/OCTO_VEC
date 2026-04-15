/**
 * Session Lifecycle — Sunset & Sunrise for VEC agents.
 *
 * SUNSET: When the system starts and the PM's saved conversation history is from
 * a previous day, we run one final "save your memories" prompt before clearing it.
 * The PM writes key events to LTM and lasting insights to SLTM.
 *
 * SUNRISE: After sunset completes (or if no stale session), history is cleared.
 * The PM starts fresh. loadAgentMemory() auto-loads yesterday's LTM (written
 * during sunset) + SLTM into every prompt — so the PM wakes up informed.
 *
 * Detection: based on the history file's last-modified date (mtime).
 * If the file exists and was last written on a day before today → stale session.
 */

import fs from "fs";
import path from "path";
import { config } from "../config.js";
import { log } from "../atp/logger.js";

const L = log.for("sessionLifecycle");

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function historyPath(agentId: string): string {
  return path.join(config.dataDir, "agent-history", `${agentId}.json`);
}

export interface SunsetCheck {
  should: boolean;
  sessionDate?: string; // YYYY-MM-DD of the stale session
}

/**
 * Returns whether a sunset should run for this agent.
 * True if a saved history file exists and was last written before today.
 */
export function shouldRunSunset(agentId: string): SunsetCheck {
  const p = historyPath(agentId);
  if (!fs.existsSync(p)) return { should: false };

  try {
    const mtime = fs.statSync(p).mtime.toISOString().slice(0, 10);
    if (mtime < today()) return { should: true, sessionDate: mtime };
  } catch (err) {
    L.warn("Cannot stat history file — skipping sunset", { agentId, path: p, error: String(err) });
  }
  return { should: false };
}

/**
 * Build the sunset prompt sent to the agent.
 * The agent is expected to call write_ltm and optionally write_sltm,
 * then respond with 'SUNSET_COMPLETE'.
 */
export function buildSunsetPrompt(sessionDate: string): string {
  return (
    `SYSTEM — SESSION SUNSET PROTOCOL\n\n` +
    `The conversation history above is YOUR real session from ${sessionDate}.\n` +
    `It is about to be permanently deleted. This is your only chance to preserve it.\n\n` +
    `Read through that actual conversation — not from memory, from the messages above — then:\n\n` +
    `1. CALL write_ltm with a concrete journal entry based on what you actually see:\n` +
    `   - Exactly what Sir asked for (quote or closely paraphrase)\n` +
    `   - Which tasks were created, which completed, which failed or are still pending\n` +
    `   - Any decisions made, blockers hit, things Sir said to follow up on\n` +
    `   - One sentence of your own reflection: what went well, what didn't\n\n` +
    `2. CALL write_sltm ONLY for something that should permanently change how you think or behave.\n` +
    `   A real pattern you noticed. A mistake worth not repeating. A lesson with lasting value.\n` +
    `   If nothing rises to that level — skip it.\n\n` +
    `3. Respond with exactly: SUNSET_COMPLETE\n\n` +
    `Base everything on the actual messages above. Do not summarise from assumptions.`
  );
}
