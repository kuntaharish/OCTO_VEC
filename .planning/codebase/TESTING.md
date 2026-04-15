# Testing Patterns

**Analysis Date:** 2026-04-14

## Testing Framework

**No testing framework is present.**

There are no test files (`*.test.ts`, `*.spec.ts`, `*.test.js`, `*.spec.js`) anywhere in the repository. No test runner configuration exists (`jest.config.*`, `vitest.config.*`, `mocha.rc`, etc.). The root `package.json` has no `test` script. The dashboard `package.json` similarly has no test script.

This is a zero-test codebase. All verification is done via manual runtime execution.

## How to Run Tests

```bash
# No test command exists. The closest available quality checks are:

npm run typecheck        # TypeScript type-check only (tsc --noEmit)
npm run build:ts         # Full TS compilation via tsconfig.build.json
```

## Test File Locations

None. No test directory, no co-located test files, no `__tests__` folder.

## Coverage

**Requirements:** None enforced.

**Coverage tooling:** Not configured.

## CI/CD Test Gates

No `.github/` directory exists. There are no GitHub Actions workflows, no CI pipeline configuration, and no automated quality gates.

## What Exists Instead of Tests

**Type safety via strict TypeScript:**
- `"strict": true` in both `tsconfig.json` and `tsconfig.build.json`
- `import type` used consistently to catch type-only import violations at compile time
- Enum-typed fields on all data models (`TaskStatus`, `Priority`, `EventType`, `EmployeeStatus`)
- Interface contracts on all inter-module boundaries (`VECAgent`, `VECChannel`, `SpecialistDeps`)

**Runtime guards in production code:**
- Input validation at tool entry points (e.g., `TASK_ID_RE.test(taskId)`, agent ID normalization)
- Guard clauses that throw descriptive errors:
  ```typescript
  if (agentId === "pm") throw new Error("Cannot remove PM agent — it is mandatory.");
  if (!handle) throw new Error(`Agent '${agentId}' not found in runtime.`);
  ```
- Defensive JSON parsing with fallback to empty arrays:
  ```typescript
  try {
    const data = JSON.parse(text);
    return Array.isArray(data) ? (data as Event[]) : [];
  } catch {
    return [];
  }
  ```

**Schema enforcement via SQLite:**
- All data constraints (NOT NULL, DEFAULT values, PRIMARY KEY) enforced at the database layer in `src/atp/database.ts`

**Manual integration verification:**
- The `npm run start` / `npm run dev` command boots the entire system; functional correctness is verified by running the agent orchestration platform directly

## Adding Tests (Guidance for Future Implementation)

If tests are added, the recommended approach based on the codebase's patterns:

**Framework to adopt:** Vitest (aligns with the ESM-first, TypeScript-native setup; no transform config needed)

**Config location:** `vitest.config.ts` at project root

**Test placement:** Co-locate alongside source — `src/atp/database.test.ts` next to `src/atp/database.ts`

**High-value units to test first** (pure functions with no I/O side effects):
- `src/atp/inboxLoop.ts` — `extractRetryAfterMs()`, `isRateLimitError()`, `formatInboxMessages()`
- `src/tools/pm/taskTools.ts` — `normalizeTaskId()`, `isValidTaskId()`, `resolveScheduledDate()`
- `src/memory/agentMemory.ts` — `today()`, `yesterday()`, `readIfExists()` (with mock fs)
- `src/channels/discord.ts` — `splitMessage()` (pure string split logic)
- `src/ar/roster.ts` — `getSpecialistEntries()`, `loadRoster()` (with mock file path)

**Integration test candidates:**
- `src/atp/database.ts` — `ATPDatabaseClass` full CRUD against an in-memory SQLite (`:memory:`)
- `src/atp/eventLog.ts` — `EventLog.log()` + `EventLog.getEvents()` against a temp file path

**Mocking approach:**
- Use `vi.mock("fs")` for file-system dependent modules
- Use a temp directory (`process.env.VEC_DATA_DIR`) for database and event log integration tests
- Use `vi.spyOn(console, "error")` to assert logged errors without side effects

---

*Testing analysis: 2026-04-14*
