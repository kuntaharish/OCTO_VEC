/**
 * One-time Codex OAuth login.
 * Run: npx tsx scripts/codex-login.ts
 * Saves credentials to data/codex-oauth.json
 */
import "dotenv/config";
import { loginOpenAICodex } from "@mariozechner/pi-ai";
import { writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { createInterface } from "readline/promises";
import { execSync } from "child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CREDS_PATH = join(__dirname, "../data/codex-oauth.json");

mkdirSync(join(__dirname, "../data"), { recursive: true });

console.log("Starting Codex OAuth login...\n");

const rl = createInterface({ input: process.stdin, output: process.stdout });

const creds = await loginOpenAICodex({
  originator: "vec-atp",
  onAuth: ({ url, instructions }) => {
    console.log(instructions);
    console.log("\nOpen this URL in your browser:\n");
    console.log(url, "\n");
    try { execSync(`start "" "${url}"`); } catch {}
  },
  onManualCodeInput: () => rl.question("Paste the auth code or redirect URL here (or wait for browser): "),
  onPrompt: ({ message }) => rl.question(message + " "),
});

rl.close();

const stored = { "openai-codex": creds };
writeFileSync(CREDS_PATH, JSON.stringify(stored, null, 2));

console.log("\nCredentials saved to", CREDS_PATH);
console.log("accountId:", creds.accountId);
console.log("Token expires:", new Date(creds.expires).toLocaleString());
console.log("\nSet in .env:");
console.log("  VEC_MODEL_PROVIDER=openai-codex");
console.log("  VEC_MODEL=gpt-5.3-codex");
