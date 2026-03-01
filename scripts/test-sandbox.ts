/**
 * Integration test for sandboxFileTools — tests the REAL wrapper with actual tools.
 * Run: npx tsx scripts/test-sandbox.ts
 */
import { getCodingTools, getReadOnlyTools, sandboxFileTools } from "../src/tools/shared/fileTools.js";
import { config } from "../src/config.js";
import path from "path";
import fs from "fs";

const MEMORY_DIR = path.resolve(config.memoryDir);

// Ensure test dirs exist
const dirs = [
  path.join(config.workspace, "agents", "dev"),
  path.join(config.workspace, "agents", "ba"),
  path.join(config.workspace, "shared"),
  path.join(MEMORY_DIR, "dev"),
  path.join(MEMORY_DIR, "ba"),
];
for (const d of dirs) fs.mkdirSync(d, { recursive: true });

// Create test files
const testFiles: [string, string][] = [
  [path.join(config.workspace, "agents", "dev", "scratch.txt"), "dev private"],
  [path.join(config.workspace, "agents", "ba", "notes.txt"), "ba private"],
  [path.join(config.workspace, "shared", "readme.md"), "shared doc"],
  [path.join(MEMORY_DIR, "dev", "test-stm.md"), "dev memory"],
  [path.join(MEMORY_DIR, "ba", "test-stm.md"), "ba memory"],
];
for (const [fp, content] of testFiles) fs.writeFileSync(fp, content, "utf-8");

// Get sandboxed tools
const devReadTools = sandboxFileTools("dev", getReadOnlyTools());
const baReadTools = sandboxFileTools("ba", getReadOnlyTools());
const devCodingTools = sandboxFileTools("dev", getCodingTools());

const devRead = devReadTools.find((t) => t.name === "read")!;
const baRead = baReadTools.find((t) => t.name === "read")!;
const devWrite = devCodingTools.find((t) => t.name === "write")!;
const devBash = devCodingTools.find((t) => t.name === "bash")!;

let passed = 0;
let failed = 0;

async function test(desc: string, fn: () => Promise<boolean>) {
  try {
    const ok = await fn();
    if (ok) {
      passed++;
      console.log(`\x1b[32mPASS\x1b[0m  ${desc}`);
    } else {
      failed++;
      console.log(`\x1b[31mFAIL\x1b[0m  ${desc}`);
    }
  } catch (err: any) {
    failed++;
    console.log(`\x1b[31mFAIL\x1b[0m  ${desc} — threw: ${err.message}`);
  }
}

function resultText(r: any): string {
  return r?.content?.[0]?.text ?? "";
}

console.log("Workspace:", config.workspace);
console.log("Memory:   ", config.memoryDir);
console.log("");

// ── READ TOOL TESTS ──

await test("dev reads own file (agents/dev/scratch.txt)", async () => {
  const r = await devRead.execute({} as any, { path: "agents/dev/scratch.txt" });
  return resultText(r).includes("dev private");
});

await test("dev reads shared file", async () => {
  const r = await devRead.execute({} as any, { path: "shared/readme.md" });
  return resultText(r).includes("shared doc");
});

await test("dev BLOCKED from BA folder", async () => {
  const r = await devRead.execute({} as any, { path: "agents/ba/notes.txt" });
  return resultText(r).includes("ACCESS DENIED");
});

await test("BA BLOCKED from dev folder", async () => {
  const r = await baRead.execute({} as any, { path: "agents/dev/scratch.txt" });
  return resultText(r).includes("ACCESS DENIED");
});

await test("dev reads own memory (absolute path)", async () => {
  const absPath = path.join(MEMORY_DIR, "dev", "test-stm.md");
  const r = await devRead.execute({} as any, { path: absPath });
  return resultText(r).includes("dev memory");
});

await test("dev BLOCKED from BA memory (absolute path)", async () => {
  const absPath = path.join(MEMORY_DIR, "ba", "test-stm.md");
  const r = await devRead.execute({} as any, { path: absPath });
  return resultText(r).includes("ACCESS DENIED");
});

await test("BA BLOCKED from dev memory (absolute path)", async () => {
  const absPath = path.join(MEMORY_DIR, "dev", "test-stm.md");
  const r = await baRead.execute({} as any, { path: absPath });
  return resultText(r).includes("ACCESS DENIED");
});

await test("dev BLOCKED from escaping workspace (../../)", async () => {
  const r = await devRead.execute({} as any, { path: "../../etc/passwd" });
  return resultText(r).includes("ACCESS DENIED");
});

await test("dev traversal to BA folder BLOCKED (shared/../agents/ba/)", async () => {
  const r = await devRead.execute({} as any, { path: "shared/../agents/ba/notes.txt" });
  return resultText(r).includes("ACCESS DENIED");
});

// ── WRITE TOOL TESTS ──

await test("dev write BLOCKED to BA folder", async () => {
  const r = await devWrite.execute({} as any, { path: "agents/ba/hack.txt", content: "pwned" });
  return resultText(r).includes("ACCESS DENIED");
});

await test("dev write BLOCKED to BA memory", async () => {
  const absPath = path.join(MEMORY_DIR, "ba", "hack.md");
  const r = await devWrite.execute({} as any, { path: absPath, content: "pwned" });
  return resultText(r).includes("ACCESS DENIED");
});

// ── BASH PASSTHROUGH TEST ──

await test("bash tool is NOT sandboxed (passthrough)", async () => {
  // bash should still work — it's explicitly skipped by sandbox
  return devBash !== undefined && devBash.name === "bash";
});

// ── Cleanup ──
for (const [fp] of testFiles) {
  try { fs.unlinkSync(fp); } catch {}
}

console.log("");
console.log(`${passed}/${passed + failed} tests passed`);
if (failed > 0) {
  console.log(`\x1b[31m${failed} FAILURES\x1b[0m`);
  process.exit(1);
}
