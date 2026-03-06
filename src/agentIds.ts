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

/** Static mapping from agent key → employee ID. */
export const AGENT_EMPLOYEE_ID: Record<string, string> = {
  pm: "EMP-001",
  architect: "EMP-002",
  ba: "EMP-003",
  researcher: "EMP-004",
  dev: "EMP-005",
  qa: "EMP-006",
  security: "EMP-007",
  devops: "EMP-008",
  techwriter: "EMP-009",
};

/** Resolve an agent key to its employee ID. Falls back to agentId if not found. */
export function getEmployeeId(agentId: string): string {
  return AGENT_EMPLOYEE_ID[agentId] ?? agentId;
}
