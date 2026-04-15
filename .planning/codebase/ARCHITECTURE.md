# Architecture

**Analysis Date:** 2026-04-14

## Pattern Overview

**Overall:** Event-driven multi-agent orchestration with a hierarchical PM-first delegation model.

**Key Characteristics:**
- Single PM agent acts as orchestrator; all user requests route through it
- Specialist agents (BA, Dev, QA, Architect, etc.) run as independent loops on `setInterval`
- All persistence is file-based JSON or SQLite — no external DB server required
- Real-time streaming to browser dashboard via Server-Sent Events (SSE) over WebSocket
- Memory is tiered: in-process conversation history + disk-backed SLTM/LTM markdown files

---

## Layers

**Entry Point / CLI:**
- Purpose: Process startup, agent wiring, readline REPL (optional), background scheduler loops
- Location: `src/tower.ts`
- Contains: `startServer()`, CLI commands via `commander`, watchdog/scheduler `setInterval` handles
- Depends on: All layers below
- Used by: Process entry (`bin/`)

**Agent Runtime (AR):**
- Purpose: Data-driven agent factory; owns the lifecycle of all specialist agent instances
- Location: `src/ar/`
- Contains: `AgentRuntime` class (`src/atp/agentRuntime.ts`), `BaseSpecialistAgent` (`src/ar/baseSpecialist.ts`), roster loader (`src/ar/roster.ts`), tool profile builder (`src/ar/toolProfiles.ts`), prompt loader (`src/ar/promptLoader.ts`)
- Depends on: ATP layer, memory layer, tools layer, `@mariozechner/pi-agent-core`
- Used by: `tower.ts`

**ATP (Agent Task Portal):**
- Purpose: All coordination infrastructure: task DB, message queues, event log, stream bus
- Location: `src/atp/`
- Contains: `ATPDatabase` (SQLite via `better-sqlite3`), `MessageQueue` (PM queue), `AgentMessageQueue` (inter-agent queue), `EventLog`, `AgentStreamBus`, `AgentRuntime`, `inboxLoop`
- Depends on: `src/config.ts`, `src/ar/roster.ts`
- Used by: agents, tools, dashboard, tower

**Agents:**
- Purpose: Concrete agent implementations
- Location: `src/agents/` (PMAgent), `src/ar/` (all specialists via `BaseSpecialistAgent`)
- Contains: `PMAgent` (`src/agents/pmAgent.ts`), `BaseSpecialistAgent` (`src/ar/baseSpecialist.ts`)
- Depends on: ATP layer, memory layer, tools, `@mariozechner/pi-agent-core`
- Used by: AgentRuntime, tower

**Tools:**
- Purpose: All callable tools exposed to agents as LLM function calls
- Location: `src/tools/`
- Contains: `src/tools/shared/` (messaging, file, memory, web, todo, reminder, date), `src/tools/pm/` (task creation, employee management), `src/tools/domain/` (git, QA, security, BA, dev, marketing, productivity)
- Depends on: ATP layer
- Used by: agents via `buildToolset()` in `src/ar/toolProfiles.ts`

**Memory:**
- Purpose: Per-agent persistent identity (SLTM), daily journals (LTM), conversation history, context compaction
- Location: `src/memory/`
- Contains: `agentMemory.ts` (SLTM/LTM loader), `messageHistory.ts` (JSON history persistence), `compaction.ts` (sliding-window trim), `autoCompaction.ts` (LLM-based summary compaction), `sessionLifecycle.ts` (sunset/sunrise)
- Depends on: `src/config.ts`, `@mariozechner/pi-agent-core`
- Used by: agents, inbox loop

**Channels:**
- Purpose: Inbound messaging adapters for 16 external platforms; all route to PM agent inbox
- Location: `src/channels/`
- Contains: `channelManager.ts` (singleton), `activeChannel.ts` (state tracker), `channelConfig.ts`, plus one file per platform (telegram, slack, discord, whatsapp, teams, matrix, signal, googlechat, irc, line, mattermost, twitch, nostr, nextcloud, synology, feishu)
- Depends on: PM agent reference
- Used by: `tower.ts` via `channelManager.initChannels()`

**Dashboard:**
- Purpose: Express HTTP + WebSocket server; serves React SPA + REST APIs + SSE streaming
- Location: `src/dashboard/`
- Contains: `server.ts` (main), `auth.ts`, `security.ts`, `mobileApi.ts`, `gitConfig.ts`, `relayClient.ts`
- Depends on: ATP layer, channels, agent runtime, stream bus
- Used by: browser clients, mobile app

**MCP Bridge:**
- Purpose: Connects to external MCP servers (Claude Code / Cursor config format), wraps their tools as `AgentTool` objects available to all agents
- Location: `src/mcp/mcpBridge.ts`
- Depends on: `@modelcontextprotocol/sdk`
- Used by: `PMAgent`, `BaseSpecialistAgent` via `getMCPTools()`

**Flows:**
- Purpose: Automated security scan pipelines (Gitleaks, Semgrep, Trivy, SonarQube) triggered post-task
- Location: `src/flows/`
- Contains: `index.ts`, `codeScanFlow.ts`, `gitleaksScanFlow.ts`, `semgrepScanFlow.ts`, `trivyScanFlow.ts`
- Used by: `src/atp/postTaskHooks.ts` after coding agent task completion

---

## Data Flow

**User Message → Agent Response:**

1. User sends message via CLI readline, dashboard `POST /api/send-message`, or channel (Telegram, etc.)
2. `ActiveChannelState` records the originating channel
3. Message is pushed to PM agent's inbox via `AgentMessageQueue.push("user", "pm", ...)`
4. `registerInboxWaker` fires the PM's `tick()` immediately (no 15s wait)
5. PM inbox loop (`startPmLiveLoop`) detects inbox message, loads agent memory (SLTM + LTM), builds structured prompt
6. PM calls `agent.prompt(text)` on `@mariozechner/pi-agent-core` Agent
7. LLM streams tokens → `publishAgentStream("pm", event)` → `agentStreamBus.emit("token", tok)`
8. SSE endpoint in `dashboard/server.ts` forwards tokens to connected browser clients
9. PM uses tool calls: `create_task` → `ATPDatabase.createTask()`, `message_agent` → `AgentMessageQueue.push()`
10. PM calls `message_agent(to_agent="user", ...)` → routes back to founder via `UserChatLog`

**Task Dispatch → Execution:**

1. PM calls `create_task(agent_id, description, ...)` → `ATPDatabase.createTask()` → status `pending`
2. `EventLog.log(TASK_CREATED, ...)` fires
3. Target specialist's inbox waker fires via `AgentMessageQueue.push("pm", agentId, taskId, ...)`
4. Specialist inbox loop tick detects message, calls `agent.executeTask(taskId)`
5. `executeTask` marks task `in_progress`, loads memory, builds task prompt with todo checklist instructions
6. Agent runs LLM loop: `read_task_details`, `todo()`, file/git tools, `update_my_task(completed)`
7. On `update_my_task(completed)`: `ATPDatabase.updateTaskStatus()`, `MessageQueue.pushSimple()` to PM queue
8. Post-task hooks run: `runPostTaskScans()` → Gitleaks/Semgrep/Trivy flows → results sent to QA inbox
9. PM proactive loop reads PM queue and relays completion summary to founder

**State Management:**

- Task state: SQLite `tasks` table in `~/.octo-vec/atp.db`
- Agent conversation: in-memory `Agent.state.messages[]` (pi-agent-core), persisted to `~/.octo-vec/agent-history/{agentId}.json` on `agent_end`
- Persistent memory: markdown files in `~/.octo-vec/memory/{agentId}/sltm.md` and `ltm/YYYY-MM-DD_memory.md`
- Inter-agent messages: JSON file `~/.octo-vec/agent_messages.json` (in-memory queue backed to disk)
- PM queue: JSON file `~/.octo-vec/pm_queue.json`
- Events: JSON file `~/.octo-vec/events.json` (capped at 200)
- Chat log: JSON file `~/.octo-vec/chat-log.json` (capped at 200)

---

## Key Abstractions

**VECAgent (interface):**
- Purpose: Contract every agent must satisfy to participate in the inbox loop
- Location: `src/atp/inboxLoop.ts`
- Fields: `inbox: AgentInbox`, `isRunning: boolean`
- Methods: `prompt(text)`, `clearHistory()`, `abort()`, `executeTask?(taskId)`, `followUp?(text)`, `steer?(text)`, `subscribeEvents?(fn)`
- Implemented by: `PMAgent`, `BaseSpecialistAgent`

**AgentInbox:**
- Purpose: Per-agent view of the shared `AgentMessageQueue` JSON store; supports `peek`, `read`, `send`, `hasMessages`
- Location: `src/atp/agentMessageQueue.ts` (class `AgentInbox`)
- Pattern: Inbox wakers map (`inboxWakers`) enables instant delivery instead of polling-only

**RosterEntry:**
- Purpose: Schema defining every agent instance: `agent_id`, `employee_id`, `name`, `template`, `tool_profile`, `capabilities`, `domain_tools`, `prompt_file`
- Location: `src/ar/roster.ts`
- Source file: `~/.octo-vec/roster.json` (seeded from `core/roster.json`)

**AgentRuntime:**
- Purpose: Lifecycle manager — creates, starts, pauses, resumes, removes specialist agents at runtime
- Location: `src/atp/agentRuntime.ts`
- Owns: `handles: Map<string, AgentHandle>`, `allAgents: Map<string, VECAgent>` (shared with PM tools and dashboard)

**StreamToken / AgentStreamBus:**
- Purpose: EventEmitter bus broadcasting LLM token events to dashboard SSE clients; 400-token replay buffer for new connections
- Location: `src/atp/agentStreamBus.ts`
- Types: `agent_start`, `text`, `thinking_start/end`, `tool_start`, `tool_end`, `agent_end`, `todo_update`

---

## Entry Points

**`startServer()` in `src/tower.ts`:**
- Triggers: `octo-vec start` (default command)
- Responsibilities: init dirs, MCP bridge, PM agent, AgentRuntime, all inbox loops, watchdog, scheduler, reminder loop, dashboard server, channels

**Dashboard `GET /` or React SPA:**
- Location: `src/dashboard/server.ts`
- Triggers: browser request
- SSE endpoint: `GET /api/stream` — forwards `agentStreamBus` tokens as newline-delimited JSON

**Channel adapters (`src/channels/*.ts`):**
- Triggers: external platform webhook/polling (e.g., Telegram update, Slack event)
- Responsibility: parse incoming message, call `pmAgent.inbox.send("user", "pm", msg, "priority")`

---

## Inbox Loop Architecture

**Per-agent polling:**
- `startInboxLoop(agent, agentId, pollIntervalMs=15_000)` — `setInterval` tick every 15 seconds
- `tick()` skips if `agent.isRunning` (task execution in progress), if `cooldownUntil` not elapsed, or if inbox empty
- Uses `peek()` not `read()` — messages stay in queue until after LLM completes (prevents "inbox is empty" confusion)
- `cleanupOpts.before = peekTimestamp` — only removes messages that existed at peek time; new arrivals during LLM call survive
- On message delivery: load SLTM/LTM memory, build structured `WHAT TO DO NOW` prompt, call `agent.prompt()`
- Rate limit handling: parses `Retry-After` from error string, sets `cooldownUntil` accordingly

**PM-specific loop:**
- `startPmLiveLoop()` in `src/atp/inboxLoop.ts` — separate interval for PM proactive checks
- PM has two sub-modes: "conversation mode" (founder message) and "task-management mode" (agent messages)
- Priority rule: founder `priority` messages are shown first via `peek({ priority: "priority", from_agent: "user" })`

**Instant wake:**
- `registerInboxWaker(agentId, fn)` — called during agent construction
- `AgentMessageQueue.push()` calls `inboxWakers.get(toAgent)?.()` immediately after writing
- Bypasses 15s poll for real-time responsiveness

---

## Memory System Design

**Three tiers:**

| Tier | File | Scope | Loaded when |
|------|------|-------|-------------|
| SLTM (permanent memory) | `~/.octo-vec/memory/{agentId}/sltm.md` | Identity, lessons, always-true facts | Every prompt |
| LTM (daily journal) | `~/.octo-vec/memory/{agentId}/ltm/YYYY-MM-DD_memory.md` | Yesterday's + today's events | Every prompt if file exists |
| Conversation history | `~/.octo-vec/agent-history/{agentId}.json` | Multi-turn LLM messages | On startup (restore) and after each `agent_end` (save) |

**Session lifecycle (sunset/sunrise):**
- On startup: `shouldRunSunset(agentId)` checks if history file mtime < today
- If stale: `pmAgent.runSunset(sessionDate)` — PM is prompted to call `write_ltm` + `write_sltm`, then history is cleared
- Next session: history is fresh; yesterday's LTM auto-loads via `loadAgentMemory()`

**Compaction:**
- `makeCompactionTransform(100)` — sliding window: keep last 100 messages, trim to first `user` role boundary
- `AutoCompactor` — proactive: compact when token estimate exceeds `0.75 * (contextWindow - 8000)`; overflow recovery: catch context length errors, compact, retry; pre-flush prompt before threshold compaction (disabled for `BaseSpecialistAgent`)

---

## Database Schema and Access Patterns

**Database:** SQLite at `~/.octo-vec/atp.db` (WAL mode), accessed via `src/atp/database.ts` (`ATPDatabaseClass` singleton exported as `ATPDatabase`)

**Tables:**

```sql
tasks (
  task_id        TEXT PRIMARY KEY,   -- "TASK-001", "TASK-002", ...
  description    TEXT NOT NULL,
  agent_id       TEXT NOT NULL,       -- lowercase agent key (e.g. "dev", "ba")
  priority       TEXT NOT NULL,       -- "high" | "medium" | "low"
  status         TEXT NOT NULL,       -- "pending" | "in_progress" | "completed" | "failed" | "cancelled"
  folder_access  TEXT DEFAULT '',     -- workspace subdirectory path for the task
  scheduled_date TEXT DEFAULT '',     -- "YYYY-MM-DD" for deferred tasks; "" = immediate
  created_at     TEXT NOT NULL,       -- ISO datetime
  updated_at     TEXT NOT NULL,       -- ISO datetime
  result         TEXT DEFAULT ''      -- agent-written completion summary
)

employees (
  employee_id     TEXT PRIMARY KEY,   -- "EMP-001", "EMP-002", ...
  agent_id        TEXT NOT NULL UNIQUE,  -- lowercase agent key
  name            TEXT NOT NULL,
  designation     TEXT NOT NULL,
  department      TEXT NOT NULL,
  hierarchy_level INTEGER NOT NULL,   -- 1=PM, 2=architect, 3=specialists
  reports_to      TEXT DEFAULT '',    -- employee_id of manager
  status          TEXT NOT NULL,      -- "available" | "busy" | "offline"
  skills          TEXT DEFAULT '',    -- comma-separated
  joined_at       TEXT NOT NULL
)

reminders (
  reminder_id    TEXT PRIMARY KEY,
  agent_id       TEXT NOT NULL,
  message        TEXT NOT NULL,
  scheduled_for  TEXT NOT NULL,       -- ISO datetime
  created_at     TEXT NOT NULL,
  triggered_at   TEXT DEFAULT ''      -- "" until fired
)
```

**Key access patterns:**
- `ATPDatabase.createTask()` — sequential TASK-NNN ID generation (SELECT MAX then +1)
- `ATPDatabase.getTasksForAgent(agentId, status?)` — filtered by `agent_id` + optional `status`
- `ATPDatabase.getDueTasks()` — `WHERE status='pending' AND scheduled_date != '' AND scheduled_date <= today`
- `ATPDatabase.getDueReminders()` — `WHERE triggered_at = '' AND scheduled_for <= now`
- `ATPDatabase.updateTaskStatus(taskId, status, result)` — single row update
- `ATPDatabase.seedEmployees()` — called on construction, upserts from `roster.json`

**JSON file stores (not SQLite):**

| File | Purpose | Max entries |
|------|---------|-------------|
| `~/.octo-vec/agent_messages.json` | Inter-agent message queue | Unbounded (cleared on restart) |
| `~/.octo-vec/pm_queue.json` | Agent→PM status updates | Unbounded |
| `~/.octo-vec/events.json` | System event log | 200 |
| `~/.octo-vec/chat-log.json` | User↔agent chat history | 200 |
| `~/.octo-vec/agent-history/{id}.json` | Per-agent LLM conversation | Compacted via AutoCompactor |
| `~/.octo-vec/token-usage.json` | Per-agent token/cost stats | All agents |
| `~/.octo-vec/model-config.json` | Per-agent model overrides | All agents |
| `~/.octo-vec/agent-groups.json` | Group chat definitions | All groups |
| `~/.octo-vec/message_flow.json` | Message routing audit log | 500 |

---

## Error Handling

**Strategy:** Containment — errors in one agent/loop never crash the runtime

**Patterns:**
- Inbox loop catches all errors; sets `cooldownUntil` (rate limit: parsed wait time; other: 30s backoff)
- `withTimeout(promise, 600_000ms, label)` wraps every LLM call — 10-minute hard cutoff
- `executeTask` tries initial prompt twice (retries on "already processing"), then runs 3 continuation attempts
- Watchdog `setInterval` marks tasks `failed` after 5 min stale `in_progress` and calls `agent.abort()`
- Post-task scan failures are caught and logged; never crash the agent loop
- `EventLog` uses atomic write (temp file + rename) to prevent partial writes

---

## Real-time Streaming Architecture

**Path:** Agent LLM event → `publishAgentStream` → `agentStreamBus` EventEmitter → SSE endpoint → browser

**`AgentStreamBus` (`src/atp/agentStreamBus.ts`):**
- `EventEmitter` with `setMaxListeners(100)` to support many concurrent SSE clients
- 400-token per-agent replay buffer — new clients receive current agent state on connect
- On `agent_start`: previous tokens for that agent are cleared from replay buffer

**Dashboard SSE endpoint:**
- `GET /api/stream` in `src/dashboard/server.ts`
- On connect: replays `getReplayBuffer()` then subscribes to `agentStreamBus.on("token", ...)`
- Also forwards `todo_update` tokens (from `publishTodoUpdate()`) for live task checklist updates

**Token types emitted:**
`agent_start`, `text`, `thinking_start`, `thinking`, `thinking_end`, `tool_start`, `tool_end`, `agent_end`, `todo_update`

---

*Architecture analysis: 2026-04-14*
