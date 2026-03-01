/**
 * Canonical list of agent IDs — single source of truth.
 * Import this instead of hardcoding agent ID arrays.
 */

/** All specialist agent IDs (everyone except PM). */
export const SPECIALIST_AGENT_IDS = [
  "ba", "dev", "qa", "security", "devops", "techwriter", "architect", "researcher",
] as const;

/** All agent IDs including PM. */
export const ALL_AGENT_IDS = ["pm", ...SPECIALIST_AGENT_IDS] as const;
