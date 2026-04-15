# Coding Conventions

**Analysis Date:** 2026-04-14

## TypeScript Configuration

**Strict mode:** Enabled (`"strict": true` in both `tsconfig.json` and `tsconfig.build.json`).

**Target / Module:**
- Dev/typecheck: `ES2022` target, `ESNext` module, `bundler` resolution
- Build: `ES2022` target, `NodeNext` module, `NodeNext` resolution

**Key flags:**
- `esModuleInterop: true`
- `resolveJsonModule: true`
- `skipLibCheck: true`
- `declaration: true`, `declarationMap: true`, `sourceMap: true` (build only)
- `allowImportingTsExtensions: true` (dev only — `.ts` extensions in imports are allowed)

**No linter or formatter config** — no `.eslintrc`, `eslint.config.*`, `biome.json`, or `.prettierrc` detected.

## Naming Conventions

**Files:**
- `camelCase` for module files: `agentRuntime.ts`, `messageQueue.ts`, `inboxLoop.ts`
- `camelCase` for tool files: `taskTools.ts`, `fileTools.ts`, `webTools.ts`
- No barrel `index.ts` files except `src/flows/index.ts`

**Classes:** `PascalCase` — `AgentRuntime`, `BaseSpecialistAgent`, `ATPDatabaseClass`, `DiscordChannel`

**Interfaces and Types:** `PascalCase` with descriptive names — `AgentHandle`, `AgentStatusEntry`, `VECChannel`, `RosterEntry`, `SpecialistDeps`

**Enums:** `PascalCase` enum name, `UPPER_SNAKE_CASE` members:
```typescript
export enum TaskStatus {
  PENDING = "pending",
  IN_PROGRESS = "in_progress",
  COMPLETED = "completed",
}

export enum EventType {
  TASK_CREATED = "task_created",
  AGENT_THINKING = "agent_thinking",
}
```

**Constants:** `UPPER_SNAKE_CASE` for module-level constants:
```typescript
const POLL_INTERVAL_MS = 15_000;
const MAX_EVENTS = 200;
const TASK_ID_RE = /^TASK-\d+$/;
```

**Functions:** `camelCase` — `startInboxLoop`, `loadRoster`, `getSpecialistEntries`, `rowToTask`

**Private class fields:** `camelCase`, prefixed with `_` when used as lazy-init sentinels or to distinguish from a getter:
```typescript
private _isRunning = false;
get isRunning(): boolean { return this._isRunning; }
```

**Exported singletons:** `PascalCase` for object-literal singletons exported as `const`:
```typescript
export const ATPDatabase = new ATPDatabaseClass();
export const MessageQueue = { push, pop, ... };
export const EventLog = { log, getEvents, clear };
```

**IDs:** Identifiers in the data domain use `snake_case` to match DB column names:
- `agent_id`, `task_id`, `employee_id`, `reminder_id`

## Import Style

**ESM with `.js` extensions** — all internal imports use `.js` extension even though source files are `.ts`:
```typescript
import { startInboxLoop } from "./inboxLoop.js";
import { ATPDatabase } from "../atp/database.js";
import { config } from "../config.js";
```

**`import type` for type-only imports** — consistently used across the codebase:
```typescript
import type { VECAgent } from "./inboxLoop.js";
import type { SpecialistDeps } from "../ar/baseSpecialist.js";
import type { PMAgent } from "../agents/pmAgent.js";
```

**Import grouping order** (observed pattern):
1. Third-party / npm packages
2. Internal modules (relative paths)

Example from `src/atp/agentRuntime.ts`:
```typescript
import type { VECAgent } from "./inboxLoop.js";           // same module
import { startInboxLoop } from "./inboxLoop.js";
import { unregisterInboxWaker } from "./agentMessageQueue.js";
import { ATPDatabase } from "./database.js";
import { clearAgentHistory } from "../memory/messageHistory.js"; // parent module
import { BaseSpecialistAgent } from "../ar/baseSpecialist.js";
```

**No path aliases** — only relative paths used; no `@/` or `~/` aliases configured.

## Code Organization Within Files

Files follow a consistent top-down structure:

1. **JSDoc file-level comment** — describes the module's purpose
2. **Imports**
3. **`// ── Types ─────────` section** — interfaces, types, enums
4. **`// ── Constants ──────` section** — module-level constants
5. **`// ── [Module Name] ──` section** — main class or exported functions
6. **`// ── [Sub-section] ──` sections** — logical groupings within a class

Section dividers use a consistent Unicode box-drawing style:
```typescript
// ── Types ─────────────────────────────────────────────────────────────────────
// ── AgentRuntime ──────────────────────────────────────────────────────────────
// ── Inbox loop management ───────────────────────────────────────────────────
// ── Dynamic agent operations ────────────────────────────────────────────────
// ── Status ──────────────────────────────────────────────────────────────────
// ── Shutdown ────────────────────────────────────────────────────────────────
// ── Internal helpers ────────────────────────────────────────────────────────
```

## Error Handling

**Pattern 1 — Typed cast with nullish fallback** (used everywhere for caught errors):
```typescript
} catch (err) {
  console.error("[Discord]", (err as Error)?.message ?? err);
}
```

**Pattern 2 — Silent swallow with inline comment** (non-fatal operations):
```typescript
try { await ch.stop(); } catch { /* best-effort */ }
try { /* ignore decrypt errors */ } catch { }
```

**Pattern 3 — Propagate via `throw new Error()`** (validation failures):
```typescript
if (agentId === "pm") throw new Error("Cannot remove PM agent — it is mandatory.");
const handle = this.handles.get(agentId);
if (!handle) throw new Error(`Agent '${agentId}' not found in runtime.`);
```

**Pattern 4 — Return error strings** (tool responses to LLM agents):
```typescript
function ok(text: string) {
  return { content: [{ type: "text" as const, text }], details: {} };
}
// Used as:
if (!query) return ok("Error: empty search query.");
return ok(`SearXNG error: HTTP ${res.status} ${res.statusText}.`);
```

**Pattern 5 — Catch-and-continue** for DB migrations:
```typescript
try {
  this.db.exec("ALTER TABLE tasks ADD COLUMN scheduled_date TEXT DEFAULT ''");
} catch {
  // Column already exists — safe to ignore
}
```

No custom error classes are used. Errors are plain `Error` objects or string messages returned as tool responses.

## Async/Await Patterns

**All async operations use `async/await`** — no raw Promise chains.

**`Promise.race` for timeouts** — consistent pattern used in both `inboxLoop.ts` and `taskTools.ts`:
```typescript
function withTimeout(promise: Promise<void>, ms: number, label: string): Promise<void> {
  let timer: NodeJS.Timeout;
  const timeout = new Promise<void>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`[timeout] ${label} did not respond within ${ms / 1000}s`)),
      ms
    );
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}
```

**Fire-and-forget wrappers** — pattern for non-critical channel sends that must never throw:
```typescript
async function discordSend(fn: () => Promise<unknown>): Promise<void> {
  try {
    await fn();
  } catch (err) {
    console.error("[Discord]", (err as Error)?.message ?? err);
  }
}
```

**`void` for intentionally ignored promises**:
```typescript
void this.handleText(decrypted);
```

**`AbortSignal.timeout()`** for fetch calls:
```typescript
const res = await fetch(url, {
  headers: { Accept: "application/json" },
  signal: AbortSignal.timeout(15_000),
});
```

## Logging

**No structured logging library** — all logging uses `console.log`, `console.error`, and `console.warn`.

**Bracketed channel prefix** pattern for all log messages:
```typescript
console.log(`  [Telegram] Bot started — authorized chat: ${this.authorizedChatId}`);
console.error("[Discord]", (err as Error)?.message ?? err);
console.warn("[Matrix] MATRIX_ROOM_ID should start with '!' — Matrix disabled.");
```

- Two leading spaces before `[Channel]` for startup messages (visual indentation)
- No spaces for error/warn messages
- `[AR]` prefix for AgentRuntime, `[Discord]`, `[Slack]`, `[Telegram]`, etc.

## Comments and Documentation

**File-level JSDoc block** at the top of every module:
```typescript
/**
 * SQLite-backed Agent Task Portal database.
 * Stores tasks with status, assignments, priorities, and results.
 * Also manages the employee registry.
 */
```

**Method JSDoc** for public class methods and exported functions:
```typescript
/**
 * Add a new agent instance from a role template.
 * Creates the roster entry, instantiates the agent, starts its inbox loop.
 */
addAgent(templateId: string, name: string, ...): AgentStatusEntry { ... }

/**
 * Start inbox loops for all registered specialists.
 * Called once after construction. Returns all interval handles.
 */
startAllLoops(...): NodeJS.Timeout[] { ... }
```

**Single-line comments** for inline logic explanation:
```typescript
// 1. Create roster entry (validates + persists)
// 4. Start inbox loop
// null = paused (comment in field declaration)
```

**Inline type comments** on interface fields:
```typescript
export interface Task {
  scheduled_date: string; // "YYYY-MM-DD" or "" for immediate
  created_at: string;     // ISO string
  result: string;
}
```

**`@deprecated` JSDoc** for deprecated exports:
```typescript
/** @deprecated Use PACKAGE_ROOT instead. Alias kept for any stragglers. */
export const PROJECT_ROOT = PACKAGE_ROOT;
```

## Function Design

**Small, focused helper functions** — private helpers extracted from classes, e.g.:
- `rowToTask()`, `rowToEmployee()`, `rowToReminder()` — row mapping in `database.ts`
- `readIfExists()`, `today()`, `yesterday()` — utilities in `agentMemory.ts`
- `ok()` — tool response builder used across tool files

**Factory functions over constructors** for channel creation:
```typescript
export function createDiscordChannel(pmAgent: PMAgent): VECChannel | null { ... }
export function createTelegramChannel(pmAgent: PMAgent): VECChannel | null { ... }
```

**Object-literal singletons** for stateless service modules (EventLog, MessageQueue):
```typescript
export const MessageQueue = {
  push(msg: Message): void { ... },
  pop(count = 1): Message[] { ... },
  isEmpty(): boolean { ... },
};
```

## Module Exports

**Named exports only** — no `export default` anywhere in the codebase.

**Singleton pattern** — classes that should have one instance are exported as instantiated constants:
```typescript
export const ATPDatabase = new ATPDatabaseClass();
export type ATPDatabaseType = ATPDatabaseClass; // type alias exported alongside
```

**Re-exported types** from the same import:
```typescript
import type { SpecialistDeps } from "../ar/baseSpecialist.js";
// both the value and type can be imported from the same source
```

---

*Convention analysis: 2026-04-14*
