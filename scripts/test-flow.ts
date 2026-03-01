/**
 * Manual test for OCTO-FLOWS code scan.
 * Usage: npx tsx scripts/test-flow.ts [target_path]
 */

import { runFlow } from "../src/flows/index.js";

const targetPath = process.argv[2] ?? "projects/test-app";

console.log(`[test-flow] Running code-scan on: ${targetPath}`);
console.log(`[test-flow] Starting...`);

const result = await runFlow("code-scan", {
  taskId: "TASK-TEST",
  agentId: "manual",
  targetPath,
});

console.log(`[test-flow] Done!`);
console.log(`[test-flow] Success: ${result.success}`);
console.log(`[test-flow] Summary: ${result.summary}`);
if (result.reportPath) console.log(`[test-flow] Report: ${result.reportPath}`);
if (result.details) console.log(`[test-flow] Details: ${result.details}`);

process.exit(0);
