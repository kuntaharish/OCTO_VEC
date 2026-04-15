# OCTO VEC — Crash-Causing Bug Review

**Scope:** Crash-causing issues only — unhandled errors, missing null checks, uncaught promise rejections, thrown exceptions in startup paths.
**Date:** 2026-04-14
**Trigger:** Process crash with `Error: No API key for provider: groq` thrown from `@mariozechner/pi-agent-core`.

---

## How the Reported Crash Actually Happened

The `Error: No API key for provider: groq` is thrown synchronously inside `streamSimpleOpenAICompletions` in `pi-agent-core`'s bundled `pi-ai` (at `node_modules/@mariozechner/pi-agent-core/node_modules/@mariozechner/pi-ai/dist/providers/openai-completions.js:272`). It fires at the start of an LLM stream call when the API key is missing.

`Agent._runLoop` wraps its stream call in a `try/catch` that catches this and converts it to a `stopReason: "error"` message — so `agent.prompt()` itself does NOT re-throw.

The actual crash mechanism is that `PMAgent.prompt()` (`src/agents/pmAgent.ts:145`) checks `lastAssistant.stopReason === "error"` and **re-throws** the error manually:
```ts
throw new Error(lastAssistant?.errorMessage || "LLM provider error");
```
This re-throw then propagates up through `AutoCompactor.run()` → `PMAgent.prompt()` → the caller. The exact call site that allows it to escape is wherever `pmAgent.prompt()` is called without an enclosing try/catch. See **CR-01** below for the primary crash site.

---

## CRITICAL Issues

### CR-01: Missing API key kills the process via unguarded `pmAgent.prompt()` in the sunset path

**File:** `src/tower.ts:402`
**Scenario:** During startup, `pmAgent.runSunset()` is called unconditionally if a stale session is detected. Inside `runSunset()`, `this.agent.prompt()` is called. If the LLM provider has no API key, `PMAgent.prompt()` re-throws the error (see `src/agents/pmAgent.ts:146`). The `runSunset()` call in tower.ts is inside a `try/finally` block but the `try` does catch — it just re-suppresses. Looking at the actual code:

```ts
// tower.ts line 402
try { await pmAgent.runSunset(sunsetCheck.sessionDate); } finally { suppressChatLog = false; }
```

This is wrapped in `try/finally` with no `catch`. If `runSunset` throws, the exception propagates up through `startServer()`, which **is** caught by the `.catch()` at line 299 — so this specific path exits with `process.exit(1)` rather than an unhandled rejection.

**Re-assessment:** This is still a CRITICAL design flaw because startup silently terminates on a recoverable error (missing API key at the time of an optional sunset operation). The fix is to add a catch clause.

**Fix:**
```ts
// tower.ts ~line 402
if (sunsetCheck.should && sunsetCheck.sessionDate) {
  suppressChatLog = true;
  try {
    await pmAgent.runSunset(sunsetCheck.sessionDate);
  } catch (err) {
    console.warn(`[VEC] Sunset failed (${err}) — continuing startup.`);
  } finally {
    suppressChatLog = false;
  }
}
```

---

### CR-02: `codexAuth.ts` throws synchronously during `PMAgent` and `BaseSpecialistAgent` construction when Codex credentials file is missing

**File:** `src/atp/codexAuth.ts:19`
**Scenario:** If `VEC_MODEL_PROVIDER=openai-codex` is set but `data/codex-oauth.json` does not exist, `codexApiKeyResolver()` calls `loadCreds()` which throws:
```ts
throw new Error(
  `Codex OAuth credentials not found at ${CREDS_PATH}.\n...`
);
```
This throw occurs **inside the `PMAgent` constructor** (`src/agents/pmAgent.ts:107`) and **inside `BaseSpecialistAgent` constructor** (`src/ar/baseSpecialist.ts:99`) which are both called during `startServer()`. Neither constructor is wrapped in try/catch. The throw propagates up through `new PMAgent(...)` in `tower.ts:389` → `startServer()` → caught by `.catch()` at line 299 → `process.exit(1)`.

**Impact:** Process exits immediately on startup if using Codex without credentials. The error message is adequate but the mechanism is fragile — any provider-specific startup validation that throws inside a constructor causes immediate process termination.

**Fix:** Defer credential validation to the first `prompt()` call rather than doing it at construction time, or wrap agent construction in a try/catch in `startServer()`:
```ts
// tower.ts ~line 389
let pmAgent: PMAgent;
try {
  pmAgent = new PMAgent(pmAgentDeps);
} catch (err) {
  console.error("[VEC] Fatal: Failed to initialize PM agent:", err);
  process.exit(1); // explicit, with clear message
}
```

---

### CR-03: `loadRoster()` throws synchronously on corrupt/missing `roster.json` — called at module import time

**File:** `src/ar/roster.ts:74`
**Scenario:** `loadRoster()` calls `readFileSync(getRosterPath(), "utf-8")` and `JSON.parse(raw)` with no error handling. If `roster.json` is missing or corrupt, this throws during module initialization. `roster.ts` is imported by `config.ts` at the top-level (`import { getEmployeeId, getSpecialistEntries } from "./ar/roster.js"`), and `config.ts` runs at module import time. This means a corrupt `roster.json` causes an unhandled exception during the very first `import` statement in any file that transitively imports `config.ts`, which is almost everything. Node.js will crash with an unhandled exception before any error handling is set up.

**File:** `src/config.ts:6`

**Fix:**
```ts
// src/ar/roster.ts, loadRoster()
export function loadRoster(): Roster {
  if (_cached) return _cached;
  let raw: string;
  try {
    raw = readFileSync(getRosterPath(), "utf-8");
  } catch (err) {
    throw new Error(`Failed to read roster.json at ${getRosterPath()}: ${err}`);
  }
  let roster: Roster;
  try {
    roster = JSON.parse(raw) as Roster;
  } catch (err) {
    throw new Error(`roster.json is not valid JSON: ${err}`);
  }
  // ... rest of validation
}
```
The deeper fix is to ensure `roster.json` is always seeded before any import can call `loadRoster()`. The `config.ts` module-level bootstrap (lines 40–44) already seeds the file, but the `import { getEmployeeId, getSpecialistEntries } from "./ar/roster.js"` on line 6 of `config.ts` runs before that seeding code executes (ESM hoisting means the `import` is resolved at parse time, but `roster.ts` caches lazily — the actual file read only happens on first `loadRoster()` call, which is in `getSpecialistEntries()` at line 6, which evaluates immediately when `config.ts` is loaded). **This is a real startup crash risk if the roster file is deleted or corrupted.**

---

### CR-04: `loadPrompt()` throws `ENOENT` during agent construction if a prompt file is missing

**File:** `src/ar/promptLoader.ts:21`
**Scenario:** `loadPrompt()` calls `readFileSync(filePath, "utf-8")` with no try/catch. This is called from `PMAgent` constructor (`src/agents/pmAgent.ts:47-57`, line 60: `const PM_SYSTEM_PROMPT = buildPMSystemPrompt()` — executed at module load time before `new PMAgent()`) and from `BaseSpecialistAgent` constructor (`src/ar/baseSpecialist.ts:76`). If a prompt file listed in `roster.json` does not exist in `core/prompts/`, the throw propagates up uncaught and terminates the process.

The `PM_SYSTEM_PROMPT` assignment at `src/agents/pmAgent.ts:60` runs at module import time — before `startServer()` even starts.

**Fix:**
```ts
export function loadPrompt(filename: string, vars: Record<string, string>): string {
  const filePath = join(PROMPTS_DIR, filename);
  let template: string;
  try {
    template = readFileSync(filePath, "utf-8");
  } catch (err) {
    throw new Error(`Prompt file not found: ${filePath} — check roster.json prompt_file field`);
  }
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    if (key in vars) return vars[key];
    return match;
  });
}
```

---

### CR-05: `ATPDatabase` singleton construction throws synchronously at module load time

**File:** `src/atp/database.ts:510`
**Scenario:** `export const ATPDatabase = new ATPDatabaseClass()` runs at module import time. The constructor calls `openDb()` which calls `new Database(DB_PATH)` (better-sqlite3). If the database is corrupted or the directory cannot be created (permissions issue), `better-sqlite3` throws synchronously. This happens before any try/catch is set up in `startServer()`. The `initDb()` call in the constructor also executes raw SQL — if the schema is malformed or the disk is full, it throws uncaught.

**Severity note:** `better-sqlite3` generally handles most errors gracefully and the directory creation is done first, but a corrupt `.db` file (e.g., from a power-loss truncation) will throw with `SqliteError: file is not a database` before any error handling is in place.

**Fix:** Wrap `new ATPDatabaseClass()` or detect corruption gracefully:
```ts
function openDb(): Database.Database {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  try {
    const db = new Database(DB_PATH);
    db.pragma("journal_mode = WAL");
    return db;
  } catch (err) {
    // Corrupt DB — rename and start fresh
    console.error(`[DB] Database corrupt (${err}) — backing up and creating fresh.`);
    try { fs.renameSync(DB_PATH, DB_PATH + ".corrupt." + Date.now()); } catch {}
    const db = new Database(DB_PATH);
    db.pragma("journal_mode = WAL");
    return db;
  }
}
```

---

### CR-06: Four webhook routes in `server.ts` have no try/catch — unhandled async errors crash Express

**Files:** `src/dashboard/server.ts:3919`, `3932`, `3943`, `3953`, `3966`

**Scenario:** The following async route handlers have no try/catch:
- `POST /api/teams-webhook` (line 3919): calls `teamsChannel.handleIncoming()` which calls `pmAgent.prompt()`. If `prompt()` throws a non-"already processing" error (e.g., API key error, network failure), the rejection propagates to Express uncaught.
- `POST /api/googlechat-webhook` (line 3932): same — calls `ch.handleIncoming()` → `pmAgent.prompt()`.
- `POST /api/line-webhook` (line 3943): calls `ch.handleWebhookEvents()` → `pmAgent.prompt()`. No catch wrapper.
- `POST /api/synology-webhook` (line 3953): calls `ch.handleIncoming()` → `pmAgent.prompt()`.
- `POST /api/feishu-webhook` (line 3966): calls `ch.handleIncoming()` → `pmAgent.prompt()`.

In Express, an unhandled promise rejection in a route handler does not crash the process in modern Node.js (unhandled rejections are warnings by default since Node 15), but they do leave the HTTP request hanging with no response (the client times out). However, if a future Node.js version or `--unhandled-rejections=throw` flag is in use, this becomes a crash.

More immediately: **there is no global Express error handler** (`app.use((err, req, res, next) => {...})`) in the entire `startDashboardServer()` function. Uncaught sync errors in route callbacks will trigger Express's default error handler which sends a 500 but still logs to stderr. The more dangerous case is uncaught promise rejections.

**Fix for each webhook route:**
```ts
app.post("/api/teams-webhook", async (req, res) => {
  try {
    const teamsChannel = channelManager.getChannel("teams");
    if (!teamsChannel) { res.status(503).json({ type: "message", text: "Teams channel not configured" }); return; }
    const { TeamsChannel } = await import("../channels/teams.js");
    if (!(teamsChannel instanceof TeamsChannel)) { res.status(503).json({ type: "message", text: "Teams channel unavailable" }); return; }
    const rawBody = JSON.stringify(req.body);
    const authHeader = req.headers["authorization"] as string | undefined;
    if (!teamsChannel.verifySignature(rawBody, authHeader)) { res.status(401).json({ type: "message", text: "Unauthorized" }); return; }
    const reply = await teamsChannel.handleIncoming(req.body?.text ?? "");
    res.json({ type: "message", text: reply });
  } catch (err: any) {
    res.status(500).json({ type: "message", text: `Internal error: ${err?.message ?? err}` });
  }
});
```
Also add a global error handler at the end of `startDashboardServer()`, before `app.listen()`:
```ts
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("[Dashboard] Unhandled route error:", err);
  if (!res.headersSent) res.status(500).json({ error: "Internal server error" });
});
```

---

## HIGH Issues (Silent Failures / Process Instability)

### HI-01: `getModel()` called with provider/model from `model-config.json` without validation — invalid config silently produces a broken model object

**Files:** `src/agents/pmAgent.ts:100`, `src/ar/baseSpecialist.ts:93`, `src/memory/autoCompaction.ts:213`

**Scenario:** `getEffectiveModel()` returns whatever is stored in `model-config.json`. If the user has saved a provider/model combination that is unknown to `pi-ai`'s static registry (e.g., a typo, a deleted model, or a model that was available in an older version), `getModel()` called with those values returns `undefined` at runtime (TypeScript types prevent this at compile time but the casts `as any` bypass the check). The `Agent` is then constructed with `model: undefined`, and when `prompt()` is called, `Agent._runLoop()` throws `"No model configured"` which re-propagates through `PMAgent.prompt()` → inbox loop → logged but not process-crashing.

At `src/memory/autoCompaction.ts:213`, `getModel(config.modelProvider as any, config.model as any)` is called to create a throwaway summarizer agent. If the provider is invalid, this call may return `undefined` and the summarizer constructor silently gets a broken model. The `Agent._runLoop` will catch and log it.

**Fix:** Validate the provider/model before constructing the Agent:
```ts
// In getEffectiveModel usage sites
const effectiveModel = getEffectiveModel(agentId);
const model = effectiveModel.provider === "ollama"
  ? buildOllamaModel(effectiveModel.model)
  : getModel(effectiveModel.provider as any, effectiveModel.model as any);
if (!model) {
  throw new Error(`Unknown model: ${effectiveModel.provider}/${effectiveModel.model}. Check model config.`);
}
```

---

### HI-02: `WhatsApp` `start()` calls itself recursively on reconnect without a backoff or recursion limit

**File:** `src/channels/whatsapp.ts:261`
**Scenario:**
```ts
if (shouldReconnect) {
  console.log("  [WhatsApp] Connection lost — reconnecting...");
  void this.start();  // recursive call with no backoff, no max retries
}
```
`start()` is async and calls `fetchLatestBaileysVersion()` which makes a network request. If the connection repeatedly fails (e.g., network is down), this creates an unbounded recursion of `start()` calls. Each call allocates a new socket, event listeners, and potentially a new readline interface. Over time this will exhaust memory and crash the process.

**Fix:**
```ts
private reconnectAttempts = 0;
private readonly MAX_RECONNECTS = 10;
private readonly RECONNECT_DELAY_MS = 5000;

// Inside connection.update handler:
if (shouldReconnect) {
  if (this.reconnectAttempts >= this.MAX_RECONNECTS) {
    console.error(`  [WhatsApp] Max reconnects reached — giving up.`);
    return;
  }
  this.reconnectAttempts++;
  const delay = Math.min(this.RECONNECT_DELAY_MS * this.reconnectAttempts, 60_000);
  console.log(`  [WhatsApp] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})...`);
  setTimeout(() => void this.start(), delay);
}
// On successful connection open:
} else if (connection === "open") {
  this.reconnectAttempts = 0;
  // ...
}
```

---

### HI-03: `channelManager.initChannels()` — unguarded `start()` call allows one channel failure to abort all remaining channel startups

**File:** `src/channels/channelManager.ts:56`
```ts
for (const id of ALL_CHANNEL_IDS) {
  _channels[id] = CREATORS[id](pmAgent);
  if (_channels[id]) await _channels[id]!.start();
}
```
If one channel's `start()` throws (despite most having try/catch internally, some exceptions may escape — e.g., `WhatsApp.start()` calls `fetchLatestBaileysVersion()` with no try/catch, which can throw on network failure), the loop aborts and subsequent channels are never started. The error propagates up to `tower.ts:516` → `startServer()` → `.catch()` at line 299 → `process.exit(1)`.

**Fix:**
```ts
for (const id of ALL_CHANNEL_IDS) {
  try {
    _channels[id] = CREATORS[id](pmAgent);
    if (_channels[id]) await _channels[id]!.start();
  } catch (err) {
    console.error(`  [Channel] Failed to start ${id}:`, (err as Error)?.message ?? err);
    _channels[id] = null;
  }
}
```

---

### HI-04: `WhatsApp.start()` calls `fetchLatestBaileysVersion()` with no error handling — network failure at startup crashes startup

**File:** `src/channels/whatsapp.ts:236`
```ts
const { version } = await fetchLatestBaileysVersion();
```
This makes an outbound network call to fetch the WhatsApp version manifest. If the network is unavailable or the upstream server is down, this throws with a fetch error. There is no try/catch around this call. The error propagates up through `start()` → `channelManager.initChannels()` (see HI-03 above) → `startServer()` → `process.exit(1)`. This means **if WhatsApp is configured and the network is temporarily down at startup, the entire VEC process exits**.

**Fix:**
```ts
let version;
try {
  ({ version } = await fetchLatestBaileysVersion());
} catch (err) {
  console.warn(`  [WhatsApp] Could not fetch latest version (${err}) — using fallback.`);
  version = [2, 3000, 1023] as any; // Baileys fallback version
}
```

---

### HI-05: `initMCP()` is called unconditionally during startup without a timeout — a hanging MCP server connection stalls the entire startup

**File:** `src/tower.ts:363`, `src/mcp/mcpBridge.ts:132`
**Scenario:** `await initMCP()` is called in `startServer()` before agents are created. `connectServer()` calls `client.connect(transport)` with no timeout. If an MCP server's command hangs (e.g., a slow npm install or an unresponsive process), `initMCP()` will block indefinitely, preventing VEC from starting. The entire startup is stalled.

**Fix:**
```ts
// In mcpBridge.ts connectServer():
await Promise.race([
  client.connect(transport),
  new Promise((_, reject) => setTimeout(() => reject(new Error("MCP connect timeout")), 10_000))
]);
```

---

## MEDIUM Issues (Degraded Behavior)

### ME-01: `autoCompaction.ts` uses `getModel(config.modelProvider, config.model)` for the summarizer — uses `config.*` (env-based) not the stored `model-config.json` settings

**File:** `src/memory/autoCompaction.ts:213`
**Scenario:** When compaction runs, the throwaway summarizer always uses the provider/model from `config.ts` (which reads env vars), not from `modelConfig.ts` (which reflects what the user configured in the dashboard). If the user changed the model via the dashboard to a different provider (e.g., from Groq to Anthropic), the compaction summarizer still tries to use the original Groq provider from env vars. If that env var is missing, `streamSimpleOpenAICompletions` throws `"No API key for provider: groq"` inside the summarizer. This error is caught by the `try/catch` in `summarizeMessages()` and falls back to a plain-text excerpt, so it does not crash — but it generates spurious errors and the fallback summary is lower quality.

**Fix:**
```ts
import { getEffectiveModel, buildOllamaModel } from "../atp/modelConfig.js";

// In summarizeMessages():
const effectiveModel = getEffectiveModel("pm"); // use the same model PM uses
const model = effectiveModel.provider === "ollama"
  ? buildOllamaModel(effectiveModel.model)
  : getModel(effectiveModel.provider as any, effectiveModel.model as any);
const summarizer = new Agent({
  initialState: {
    systemPrompt: "You are a precise conversation summariser...",
    model,
    // ...
  }
});
```

---

### ME-02: `PM_SYSTEM_PROMPT` is computed at module load time — `getPMEntry()` throws if roster has no enabled PM at import time

**File:** `src/agents/pmAgent.ts:60`
```ts
const PM_SYSTEM_PROMPT = buildPMSystemPrompt();
```
`buildPMSystemPrompt()` calls `getPMEntry()` which throws `"roster.json: no enabled PM entry found."` if the roster has no enabled PM agent. This runs at module load time (top-level constant assignment in the module body), so a misconfigured roster crashes the process before `startServer()` can even be called. Combined with CR-03 (roster.json missing), this is a compounding risk.

**Fix:** Defer the system prompt build to the `PMAgent` constructor:
```ts
export class PMAgent implements VECAgent {
  private pmSystemPrompt: string;
  constructor(deps: ...) {
    this.pmSystemPrompt = buildPMSystemPrompt(); // built inside constructor, not at module load
    // ...
  }
}
```

---

### ME-03: `pkg` read from `package.json` at module load in `tower.ts` — file-not-found crashes before Commander.js parses args

**File:** `src/tower.ts:281`
```ts
const pkg = JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url), "utf-8"));
```
This runs at top-level module evaluation time. If the package is installed in a non-standard location where `../package.json` does not resolve correctly (e.g., symlinked installs, certain global npm configurations), this throws `ENOENT` before Commander.js is even set up. The error is uncaught.

**Fix:**
```ts
let pkg = { version: "unknown" };
try {
  pkg = JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url), "utf-8"));
} catch { /* non-fatal — version display only */ }
```

---

### ME-04: No `process.on('uncaughtException')` or `process.on('unhandledRejection')` handler — any missed throw anywhere silently crashes the process

**File:** `src/tower.ts` (entire file — absent)
**Scenario:** The codebase has `SIGINT` and `SIGTERM` handlers but no global `uncaughtException` or `unhandledRejection` handler. Any promise rejection that is not caught (e.g., in a `setInterval` callback, an EventEmitter handler, or a fire-and-forget `void somePromise()` call) will produce a warning in Node 15+ but will terminate the process in older Node or with `--unhandled-rejections=throw`. The original crash (`Error: No API key for provider: groq`) may have been an unhandled rejection that was not caught by the inbox loop's outer try/catch under certain timing conditions.

**Fix:** Add at the top of `tower.ts`, before any async operations:
```ts
process.on("uncaughtException", (err) => {
  console.error("[VEC] Uncaught exception:", err);
  // Do NOT call process.exit() here — log and attempt graceful recovery
});

process.on("unhandledRejection", (reason) => {
  console.error("[VEC] Unhandled promise rejection:", reason);
});
```

---

## Summary Table

| ID    | File                                | Line   | Severity | Description |
|-------|-------------------------------------|--------|----------|-------------|
| CR-01 | `src/tower.ts`                     | 402    | CRITICAL | Sunset startup path — missing `catch` means API key error exits process |
| CR-02 | `src/atp/codexAuth.ts`             | 19     | CRITICAL | Codex credentials missing throws in constructor → startup exit |
| CR-03 | `src/ar/roster.ts`                 | 74     | CRITICAL | `readFileSync` in `loadRoster()` — corrupt roster crashes at import time |
| CR-04 | `src/ar/promptLoader.ts`           | 21     | CRITICAL | `readFileSync` in `loadPrompt()` — missing prompt file crashes at module load |
| CR-05 | `src/atp/database.ts`              | 510    | CRITICAL | SQLite open at module load — corrupt `.db` file crashes before startup |
| CR-06 | `src/dashboard/server.ts`          | 3919–3984 | CRITICAL | 5 webhook routes with no try/catch — unhandled async rejections |
| HI-01 | `src/agents/pmAgent.ts:100`, `src/ar/baseSpecialist.ts:93` | 100/93 | HIGH | `getModel()` result not validated — invalid config → silent "no model" failure |
| HI-02 | `src/channels/whatsapp.ts`         | 261    | HIGH | Unbounded recursive reconnect → memory exhaustion crash |
| HI-03 | `src/channels/channelManager.ts`   | 56     | HIGH | Channel `start()` failure aborts all remaining channel startups |
| HI-04 | `src/channels/whatsapp.ts`         | 236    | HIGH | `fetchLatestBaileysVersion()` unguarded — network failure at startup exits process |
| HI-05 | `src/mcp/mcpBridge.ts`             | 86     | HIGH | `client.connect()` has no timeout — hung MCP server stalls startup indefinitely |
| ME-01 | `src/memory/autoCompaction.ts`     | 213    | MEDIUM | Compaction summarizer uses env-based model, not dashboard-configured model |
| ME-02 | `src/agents/pmAgent.ts`            | 60     | MEDIUM | `PM_SYSTEM_PROMPT` computed at module load — roster misconfiguration crashes at import |
| ME-03 | `src/tower.ts`                     | 281    | MEDIUM | `package.json` read at module load — wrong install path crashes before Commander.js |
| ME-04 | `src/tower.ts`                     | —      | MEDIUM | No global `uncaughtException` / `unhandledRejection` handlers |

---

_Reviewed: 2026-04-14_
_Focus: crash-causing issues only (unhandled errors, missing null checks, uncaught rejections, startup throws)_
