/**
 * Post-task hooks — automated security scans that run after coding tasks complete.
 *
 * When a coding agent finishes a task and auto-commits, these hooks fire:
 *   1. secret-scan  (Gitleaks)  — detect leaked credentials
 *   2. sast-scan    (Semgrep)   — static application security testing
 *   3. sca-scan     (Trivy)     — dependency vulnerability scanning
 *   4. code-scan    (SonarQube) — only if SONAR_TOKEN is configured
 *
 * Results are sent to the QA agent's inbox as a structured report.
 * Scans run sequentially to avoid Docker resource contention.
 * Failures are logged but never crash the agent runtime.
 */

import { runFlow } from "../flows/index.js";
import type { FlowResult } from "../flows/index.js";
import { AgentMessageQueue, AGENT_DISPLAY_NAMES } from "./agentMessageQueue.js";
import { EventLog } from "./eventLog.js";
import { EventType } from "./models.js";
import { config } from "../config.js";
import { log } from "./logger.js";

const L = log.for("postTaskHooks");

// ── Types ────────────────────────────────────────────────────────────────────

interface HookResult {
  flowName: string;
  result: FlowResult;
}

// ── Main entry point ─────────────────────────────────────────────────────────

/**
 * Run all configured post-task security scans against a project directory.
 * Sends a summary report to the QA agent's inbox.
 *
 * This function is fire-and-forget — callers should `.catch()` the promise.
 */
export async function runPostTaskScans(
  taskId: string,
  agentId: string,
  projectDir: string,
): Promise<void> {
  if (!config.postTaskScansEnabled) return;

  EventLog.log(
    EventType.SCAN_COMPLETED, agentId, taskId,
    `Post-task scans starting for ${taskId}`,
  );

  // Determine which scans to run
  const scansToRun = ["secret-scan", "sast-scan", "sca-scan"];
  if (config.sonarToken) scansToRun.push("code-scan");

  const results: HookResult[] = [];

  // Run scans sequentially — they spawn Docker containers, parallel would overwhelm
  for (const flowName of scansToRun) {
    try {
      const result = await runFlow(flowName, {
        taskId,
        agentId,
        targetPath: projectDir,
      });
      results.push({ flowName, result });
    } catch (err) {
      L.error("Post-task scan failed", err, { flowName, taskId, agentId, projectDir });
      results.push({
        flowName,
        result: { success: false, summary: `Hook error: ${err}` },
      });
    }
  }

  // Build summary and send to QA agent
  const summary = buildScanSummary(taskId, agentId, results);

  AgentMessageQueue.push(
    "system",
    "qa",
    taskId,
    summary,
    "normal",
  );

  // Log completion
  const passed = results.every((r) => r.result.success);
  const failCount = results.filter((r) => !r.result.success).length;
  EventLog.log(
    EventType.SCAN_COMPLETED, agentId, taskId,
    passed
      ? `Post-task scans PASSED for ${taskId} (${results.length}/${results.length} clean)`
      : `Post-task scans: ${failCount}/${results.length} FAILED for ${taskId}`,
  );
}

// ── Report builder ───────────────────────────────────────────────────────────

function buildScanSummary(
  taskId: string,
  agentId: string,
  results: HookResult[],
): string {
  const agentName = AGENT_DISPLAY_NAMES[agentId] ?? agentId;
  const passed = results.filter((r) => r.result.success).length;
  const total = results.length;

  const lines: string[] = [
    `POST-TASK SCAN REPORT -- ${taskId}`,
    `Agent: ${agentName}`,
    `Scans completed: ${total}/${total}`,
    ``,
  ];

  for (const { flowName, result } of results) {
    const icon = result.success ? "[PASS]" : "[FAIL]";
    lines.push(`${icon} ${flowName}: ${result.summary}`);
    if (result.reportPath) {
      lines.push(`  Report: ${result.reportPath}`);
    }
  }

  lines.push(``);

  if (passed < total) {
    lines.push(
      `Action required: Review the failed scan reports above and create follow-up bug tasks if needed.`,
    );
  } else {
    lines.push(`All scans passed -- no action required.`);
  }

  return lines.join("\n");
}
