# Codebase Concerns

**Analysis Date:** 2026-04-14

---

## Security Considerations

### [HIGH] Terminal WebSocket exposes full shell access
- Risk: The `/ws/terminal` endpoint spawns a real PTY shell on the server. Any authenticated user gets a full shell with the same OS permissions as the Node process. There is no session isolation, no audit log of commands, and no resource limits on the spawned shell.
- Files: `src/dashboard/server.ts` (lines 4273–4369)
- Current mitigation: Requires JWT cookie or API key auth before accepting WebSocket upgrade. CWD is constrained to workspace.
- Recommendations: Add command audit logging; consider rate-limiting terminal connections; document that this feature exposes full server shell access.

### [HIGH] Dashboard API key transmitted in URL query string
- Risk: The dashboard start URL is `http://localhost:3000?key=<apikey>`. This key appears in server logs, browser history, referrer headers, and the persisted `.dashboard-url` file at `~/.octo-vec/.dashboard-url`. API key in query params is a well-known OWASP A2 violation.
- Files: `src/dashboard/server.ts` (line 4199–4202), `src/dashboard/security.ts` (lines 58–66)
- Current mitigation: Key also accepted via `X-API-Key` header; JWT cookies are the primary auth path after first login.
- Recommendations: Remove key from startup URL; use JWT login flow exclusively; stop persisting the URL with the key embedded.

### [HIGH] `secure: false` on auth cookies hardcoded
- Risk: JWT `httpOnly` cookies are set with `secure: false` in `src/dashboard/auth.ts` (lines 108, 117). This means cookies are transmitted over plain HTTP. If the dashboard is ever exposed on a LAN or through the relay server, session cookies travel in cleartext.
- Files: `src/dashboard/auth.ts` (lines 105–118)
- Current mitigation: Default bind address is `127.0.0.1`.
- Recommendations: Detect HTTPS context or make `secure` configurable; document explicitly that HTTPS proxy is needed before exposing on a network.

### [HIGH] Relay server listens on `0.0.0.0` with no TLS
- Risk: `relay/server.js` binds to `0.0.0.0:8080` with no TLS. The `RELAY_SECRET` is the only protection. All relay traffic (including agent message content and API responses) is sent in cleartext over the internet.
- Files: `relay/server.js` (line 286)
- Current mitigation: `verifySecret()` uses `crypto.timingSafeEqual`; requests without secret are rejected.
- Recommendations: Add TLS termination (reverse proxy or native); document that relay should only be deployed behind HTTPS.

### [MEDIUM] CSP includes `'unsafe-inline'` and `'unsafe-eval'`
- Risk: Helmet CSP directives allow `'unsafe-inline'` and `'unsafe-eval'` on both `scriptSrc` and `scriptSrcElem`. This negates XSS protection from the Content Security Policy.
- Files: `src/dashboard/security.ts` (lines 89–96)
- Current mitigation: Helmet is configured; other directives are restrictive.
- Recommendations: Eliminate inline scripts from the legacy fallback HTML in `server.ts` and use nonces or hashes instead.

### [MEDIUM] Teams webhook secret is optional — open mode allowed
- Risk: `TEAMS_OUTGOING_WEBHOOK_SECRET` is optional. When not set, `verifyRequest()` returns `true` unconditionally, meaning any HTTP POST to the Teams webhook endpoint is accepted without authentication.
- Files: `src/channels/teams.ts` (lines 89–101)
- Current mitigation: Comment in code acknowledges "no secret = skip verification".
- Recommendations: Make the secret required or at minimum warn loudly at startup when no secret is set.

### [MEDIUM] Approval system is purely in-memory and non-persistent
- Risk: `_pendingApprovals` array in `src/dashboard/mobileApi.ts` (line 49) is in-memory only. A process restart silently drops all pending approvals — agents waiting for approval are left indefinitely blocked with no notification.
- Files: `src/dashboard/mobileApi.ts` (lines 34–85)
- Current mitigation: Comment says "in-memory for now, persisted on restart via events" but no actual persistence exists.
- Recommendations: Persist approvals to SQLite on creation; rehydrate and resolve or expire on startup.

### [LOW] `(config as any)` used to mutate read-only config at runtime
- Risk: Integration config saving in `src/integrations/integrationConfig.ts` uses `(config as any).sonarToken = ...` (lines 103–116) to bypass TypeScript's readonly guarantees and mutate the global config object. This pattern is present in 14 places across `integrationConfig.ts` and could hide type errors if config fields are renamed.
- Files: `src/integrations/integrationConfig.ts` (lines 91–154)
- Recommendations: Add mutable setters to config or use a proper config registry pattern instead of `as any` casts.

---

## Performance Bottlenecks

### [HIGH] Message queue and event log use synchronous file I/O on every operation
- Problem: `AgentMessageQueue.push()`, `AgentMessageQueue.popForAgent()`, `EventLog.log()`, and `UserChatLog.log()` all call `fs.readFileSync` and `fs.writeFileSync` synchronously on every single message or event. Under concurrent agent activity (8+ agents all active), this creates write contention on three JSON files: `agent_messages.json`, `events.json`, and `chat-log.json`.
- Files: `src/atp/agentMessageQueue.ts` (lines 84–109), `src/atp/eventLog.ts` (lines 22–38)
- Cause: Chosen for simplicity; SQLite is used for tasks but not for messaging/events.
- Improvement path: Move message queue and event log into the existing SQLite database (`atp.db`) which already handles concurrent writes via WAL mode.

### [MEDIUM] Token usage estimation fallback is inaccurate (2.5x multiplier)
- Problem: When a provider does not return real token counts, `trackTurnEnd()` estimates input tokens as `outputTokens * 2.5`. This is a rough heuristic that can be off by 10x for complex prompts, making finance/budget tracking unreliable.
- Files: `src/atp/tokenTracker.ts` (lines 128–131)
- Cause: Streaming APIs do not always surface token counts mid-stream.
- Improvement path: Use actual provider `usage` fields when available (already done for some providers); log a warning when estimation is used.

### [MEDIUM] Dashboard server.ts is 4,373 lines — one monolithic file
- Problem: `src/dashboard/server.ts` is 4,373 lines, making it slow to parse, hard to navigate, and a persistent merge conflict surface. It contains inline CSS (~800 lines), inline JS (~600 lines for the legacy fallback HTML dashboard), route handlers, WebSocket logic, and Git operation implementations.
- Files: `src/dashboard/server.ts`
- Improvement path: Extract route groups into separate router files; move legacy HTML dashboard to a static file; the legacy HTML dashboard may be removable once React build is stable.

### [LOW] SonarQube scan flow includes a hardcoded 5-second `setTimeout` sleep
- Problem: `src/flows/codeScanFlow.ts` line 107 does `await new Promise((r) => setTimeout(r, 5000))` to wait for SonarQube to process results. This always delays the scan result by 5 seconds, even when SonarQube is fast.
- Files: `src/flows/codeScanFlow.ts` (line 107)
- Improvement path: Poll the SonarQube task status API instead of sleeping.

---

## Tech Debt

### [HIGH] Dev/QA domain tools return static template strings, not real outputs
- Issue: `src/tools/domain/devTools.ts` tools (`write_code`, `review_code`, `debug_issue`, `refactor_code`) return hardcoded markdown template strings with placeholder text like `[Implementation would go here]`, `[Issue 1: ...]`, `[Check for off-by-one errors]`. The tools provide no real code analysis — they are scaffolds that rely entirely on the LLM filling in the brackets. If the LLM uses these tools literally, it produces template output rather than real results.
- Files: `src/tools/domain/devTools.ts` (lines 27–200+)
- Impact: Dev agent may return template placeholders rather than real code review or debug analysis. This is functional only because the LLM tends to ignore the template structure, but it is fragile.
- Fix approach: Evaluate whether these tool scaffolds are needed at all; if so, replace with tools that perform actual static analysis (e.g. calling ESLint, tsc, or grep) or remove them entirely so the LLM uses its own reasoning.

### [MEDIUM] `getNextTaskId()` has a sequential numbering race condition
- Issue: Task IDs are generated by reading the highest existing `task_id`, parsing the number, and incrementing. Under concurrent task creation (two agents creating tasks simultaneously), both reads could see the same max ID and produce the same `TASK-XXX`.
- Files: `src/atp/database.ts` (lines 143–149)
- Impact: Duplicate task IDs are possible, though SQLite's `TEXT PRIMARY KEY` constraint would cause a write error on the second insert.
- Fix approach: Use `MAX(CAST(SUBSTR(task_id, 6) AS INTEGER)) + 1` inside a single transaction, or use SQLite `AUTOINCREMENT`.

### [MEDIUM] Database schema migration is a single try/catch with no version tracking
- Issue: `ATPDatabaseClass.migrateDb()` attempts `ALTER TABLE tasks ADD COLUMN scheduled_date` and silently ignores the error if the column exists. There is no migration version table, no rollback mechanism, and no history of applied migrations.
- Files: `src/atp/database.ts` (lines 132–139)
- Impact: Future schema changes added this way will be silently skipped or fail in unpredictable ways. There is no way to tell which migrations have run.
- Fix approach: Implement a proper migration table (`schema_migrations`) with versioned migration scripts.

### [MEDIUM] `server.ts` uses `execSync` with `shell: true` for Docker/which checks
- Issue: Lines 3126–3139 of `src/dashboard/server.ts` call `execSync("docker --version", { shell: true })` and `execSync(which, { shell: true })`. Using `shell: true` with `execSync` creates injection risk if any part of the command string comes from user input. While these specific calls appear safe (static strings), the pattern is dangerous and inconsistent with the rest of the codebase which uses `execFileSync`.
- Files: `src/dashboard/server.ts` (lines 3126–3139)
- Fix approach: Replace with `execFileSync("docker", ["--version"])` without shell interpolation.

### [LOW] No `unhandledRejection` or `uncaughtException` handlers
- Issue: `src/tower.ts` (lines 508–509) only registers `SIGINT` and `SIGTERM` handlers. There are no `process.on("unhandledRejection")` or `process.on("uncaughtException")` handlers. An unhandled promise rejection in any background timer (inbox loops, reminder scheduler, watchdog) will either silently fail or crash the process with no log.
- Files: `src/tower.ts`
- Fix approach: Add `process.on("unhandledRejection", (reason) => EventLog.log(...))` at startup in tower.ts.

### [LOW] Inline HTML legacy dashboard embedded in server.ts
- Issue: ~1,500 lines of inline HTML/CSS/JS (the legacy fallback dashboard) live inside `src/dashboard/server.ts` as a `getDashboardHtml()` function starting around line 110. This code is served when the React build (`dashboard/dist`) is absent. It duplicates UI logic and makes server.ts extremely long.
- Files: `src/dashboard/server.ts` (lines ~110–2200)
- Fix approach: Move to a static `src/dashboard/fallback.html` file; or deprecate once React build is always present.

---

## Known Bugs

### [MEDIUM] Pending approvals are permanently lost on process restart
- Symptoms: If the process is restarted while an agent is awaiting a tool-execution approval, the Promise in `requestApproval()` never resolves. The agent is stuck indefinitely.
- Files: `src/dashboard/mobileApi.ts` (lines 53–72)
- Trigger: Restart the process while an agent has a pending approval dialog.
- Workaround: None. User must manually fail/restart the affected task.

### [MEDIUM] Task ID numbering will wrap/collide at TASK-999 if using `padStart(3, "0")`
- Symptoms: `getNextTaskId()` uses `String(num + 1).padStart(3, "0")` which produces `TASK-001` through `TASK-999` correctly, but `TASK-1000` and above still work since `padStart` does not truncate. However, the `DESC LIMIT 1` ordering on task IDs is lexicographic, not numeric — `TASK-100` sorts before `TASK-20` as a string. This means the "next ID" logic will produce incorrect IDs once tasks exceed `TASK-099`.
- Files: `src/atp/database.ts` (lines 143–149)
- Trigger: Create more than 99 tasks.
- Workaround: None currently; string sort `TASK-100 < TASK-20` causes the counter to misfire.

---

## Error Handling Gaps

### [MEDIUM] Inbox loop swallows all errors silently
- Problem: `setInterval(() => { tick().catch(() => {}); }, pollIntervalMs)` at `src/atp/inboxLoop.ts` line 450 discards ALL errors from the inbox tick with an empty catch. Failed inbox ticks produce no log entry and no event — they vanish silently.
- Files: `src/atp/inboxLoop.ts` (line 450)
- Fix approach: Log caught errors to `EventLog` at minimum.

### [MEDIUM] `executeTask` errors in afterPrompt are silently swallowed
- Problem: `agent.executeTask!(task.task_id).catch(() => {})` in `src/atp/agentRuntime.ts` line 357 discards all errors from task execution in the afterPrompt callback.
- Files: `src/atp/agentRuntime.ts` (lines 351–360)
- Fix approach: Log the error to `EventLog` with the task ID before swallowing.

### [LOW] Channel error messages leak internal error details to external users
- Problem: Several channel handlers send raw error objects to users via messaging platforms: `return `Error: ${err}``. This exposes stack traces or internal error messages to whoever is chatting with the agent.
- Files: `src/channels/synology.ts` (line 101), `src/channels/feishu.ts` (line 103), `src/channels/googlechat.ts` (line 105), `src/channels/mattermost.ts` (line 114), `src/channels/signal.ts` (line 115), `src/channels/line.ts` (line 118), `src/channels/irc.ts` (line 110)
- Fix approach: Return a sanitized error message like "I encountered an error processing your request" and log the real error server-side.

---

## Test Coverage Gaps

### [HIGH] Zero automated tests exist in the entire codebase
- What's not tested: All business logic — task routing, inbox loop behavior, auth middleware, path sandboxing, channel message handling, compaction logic, approval system, token tracking, database operations.
- Files: All of `src/`; no `*.test.ts` or `*.spec.ts` files exist anywhere in the project.
- Risk: Every change to core logic is untested. Regressions in auth, sandboxing, or the message queue are invisible until a user encounters them in production.
- Priority: High

### [HIGH] Bash workspace containment sandbox has no test coverage
- What's not tested: The `extractPathTokens()` and `isBashPathAllowed()` functions in `src/tools/shared/fileTools.ts` implement security-critical path traversal prevention. Edge cases (Windows paths, URL-like strings, encoded paths, symlinks) are completely untested.
- Files: `src/tools/shared/fileTools.ts` (lines 134–183)
- Risk: A bypassed path check allows agents to read/write files outside the workspace.
- Priority: High

---

## Operational Concerns

### [HIGH] All logging goes to `console.log/error/warn` — no structured logging
- Problem: The entire codebase uses `console.log`, `console.warn`, and `console.error` for operational output. There is no log levels, no structured JSON output, no log rotation, no correlation IDs, and no way to route logs to external systems (Datadog, CloudWatch, etc.).
- Files: Across all `src/channels/*.ts`, `src/atp/agentRuntime.ts`, `src/atp/autoCompaction.ts`
- Impact: In production deployments, logs are interleaved, unstructured, and unqueryable. Debugging multi-agent issues requires grepping raw terminal output.
- Improvement path: Introduce a structured logger (e.g. `pino`) at the `src/tower.ts` entry point; route all channel and runtime logs through it.

### [MEDIUM] Event log is capped at 200 entries with no archival
- Problem: `src/atp/eventLog.ts` line 57 caps the event log at `MAX_EVENTS = 200` by splicing older entries. There is no archival, export, or configurable retention. In a busy multi-agent session, 200 events fills up in minutes and historical debug data is lost.
- Files: `src/atp/eventLog.ts` (lines 55–58)
- Improvement path: Move events to SQLite with a `LIMIT` query for the API; or implement log rotation to dated files.

### [MEDIUM] Reminder scheduler polls every 30 seconds even with no due reminders
- Problem: The reminder loop at `src/tower.ts` line 452 runs every 30 seconds unconditionally, querying the database and iterating results. With many agents and reminders, this is low-overhead but adds unnecessary database reads.
- Files: `src/tower.ts` (lines 452–490)
- Improvement path: Use a priority queue or SQLite `MIN(scheduled_for)` to compute next wake time and use a targeted `setTimeout` instead of constant polling.

### [LOW] No health check or liveness endpoint on the main server
- Problem: The relay server has `/health` but the main dashboard server has no `/healthz` or `/readyz` endpoint. Container orchestration (Docker, Kubernetes) cannot determine if the service is healthy without custom TCP probes.
- Files: `src/dashboard/server.ts`
- Improvement path: Add a `GET /health` route that returns `200 OK` with uptime and basic service status.

---

## Scalability Limits

### [MEDIUM] All agent state is single-process, single-node
- Current capacity: The entire agent runtime, message queue, and database connection are single-process. All agents share one Node.js event loop.
- Limit: Adding more than ~10–15 concurrently active agents will saturate a single event loop, particularly during simultaneous LLM streaming.
- Scaling path: No horizontal scaling path exists today. The file-based message queue and synchronous DB writes are architectural blockers. Moving to a proper message broker (Redis pub/sub) and a proper database server would be needed before multi-node scaling.

### [LOW] AgentStreamBus replay buffer grows unbounded per agent turn
- Current capacity: `REPLAY_LIMIT = 400` tokens total across all agents in `src/atp/agentStreamBus.ts` (line 57). With many concurrent agents each generating long outputs, the 400-token limit is shared and fills quickly.
- Limit: New SSE clients miss history for long turns.
- Scaling path: Per-agent replay buffers with per-agent limits.

---

## Dependencies at Risk

### [MEDIUM] `@whiskeysockets/baileys` is an unofficial WhatsApp library
- Risk: Baileys (`^7.0.0-rc.9`) is a release-candidate that uses unofficial WhatsApp Web reverse-engineering. WhatsApp regularly changes their Web API/protocol, which can break the library with no warning. The library can also trigger account bans if WhatsApp detects automated usage.
- Files: `src/channels/whatsapp.ts`, `package.json`
- Impact: WhatsApp channel breaks silently after WhatsApp protocol changes.
- Migration plan: Use WhatsApp Business API (official) if WhatsApp is a critical channel.

### [MEDIUM] `node-pty` is an optional dependency that silently disables terminal
- Risk: `node-pty` is listed as `optionalDependencies` and the terminal WebSocket is wrapped in a try/catch that silently disables it if the module is missing. Users on systems where node-pty native build fails (common on Windows without build tools) get no terminal without any clear error message.
- Files: `src/dashboard/server.ts` (lines 4274–4369), `package.json`
- Recommendation: Add a startup log message indicating terminal is disabled and why.

### [LOW] Dependency on `@mariozechner/pi-agent-core`, `pi-ai`, `pi-coding-agent` (private/small ecosystem)
- Risk: All three core agent abstractions (`^0.53.1`, `^0.54.0`, `^0.53.1`) depend on a single author's private packages. Any breaking API change requires coordinated updates across all three packages. There are no TypeScript-level contracts for the `AgentEvent` type — it is accessed as `(event as any).assistantMessageEvent` throughout the stream bus.
- Files: `src/atp/agentStreamBus.ts` (lines 96–127), `src/agents/pmAgent.ts`
- Risk: Upstream breaking change with no migration path.

---

*Concerns audit: 2026-04-14*
