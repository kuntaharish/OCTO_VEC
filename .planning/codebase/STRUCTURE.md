# Codebase Structure

**Analysis Date:** 2026-04-14

## Directory Layout

```
OCTO_VEC/
├── src/                    # All TypeScript source — compiled to dist/
│   ├── tower.ts            # Entry point: wires all modules, starts server
│   ├── config.ts           # Central config object + USER_DATA_DIR
│   ├── identity.ts         # Founder identity (name, agentKey)
│   ├── init.ts             # First-run user data directory bootstrap
│   ├── onboarding.ts       # CLI onboarding wizard
│   ├── migrate.ts          # Data migration (old ./data/ → ~/.octo-vec)
│   ├── agents/             # Concrete agent implementations
│   │   └── pmAgent.ts      # PMAgent class (orchestrator)
│   ├── ar/                 # Agent Registry — factory + roster + tooling
│   │   ├── baseSpecialist.ts   # BaseSpecialistAgent (all non-PM agents)
│   │   ├── roster.ts           # Roster loader/mutator (roster.json)
│   │   ├── toolProfiles.ts     # buildToolset() per RosterEntry
│   │   ├── promptLoader.ts     # Loads markdown prompt templates
│   │   └── registry.ts         # Agent display registry helpers
│   ├── atp/                # Agent Task Portal — coordination infrastructure
│   │   ├── database.ts         # SQLite: tasks, employees, reminders
│   │   ├── models.ts           # TypeScript enums + interfaces (Task, Employee, etc.)
│   │   ├── agentRuntime.ts     # AgentRuntime lifecycle manager
│   │   ├── inboxLoop.ts        # startInboxLoop, startPmLiveLoop, VECAgent interface
│   │   ├── agentMessageQueue.ts # Inter-agent JSON queue + AgentInbox class
│   │   ├── messageQueue.ts     # PM JSON queue (agent → PM status updates)
│   │   ├── eventLog.ts         # System event log (JSON file, max 200)
│   │   ├── agentStreamBus.ts   # SSE EventEmitter bus + replay buffer
│   │   ├── chatLog.ts          # User↔agent chat log (JSON, max 200)
│   │   ├── agentGroups.ts      # Group chat (named collections of agents)
│   │   ├── agentInterrupt.ts   # Mid-task interrupt registry
│   │   ├── agentToolConfig.ts  # Per-agent tool enable/disable overrides
│   │   ├── modelConfig.ts      # Per-agent model + provider overrides
│   │   ├── tokenTracker.ts     # Per-agent token usage + cost accumulation
│   │   ├── postTaskHooks.ts    # Post-task security scan triggers
│   │   ├── messageDebouncer.ts # Batches rapid inbound messages
│   │   ├── llmDebug.ts         # Stall-detection debug monitor
│   │   └── codexAuth.ts        # API key resolver for pi-agent-core
│   ├── memory/             # Agent memory: SLTM, LTM, conversation history, compaction
│   │   ├── agentMemory.ts      # loadAgentMemory(): SLTM + LTM loader
│   │   ├── messageHistory.ts   # saveAgentHistory / loadAgentHistory (JSON)
│   │   ├── compaction.ts       # makeCompactionTransform(): sliding-window trim
│   │   ├── autoCompaction.ts   # AutoCompactor: LLM-based context management
│   │   └── sessionLifecycle.ts # shouldRunSunset / buildSunsetPrompt
│   ├── tools/              # All agent-callable tools
│   │   ├── shared/             # Universal tools available to all agents
│   │   │   ├── messagingTools.ts   # message_agent, read_inbox
│   │   │   ├── fileTools.ts        # read, write, glob, bash (profile-gated)
│   │   │   ├── memoryTools.ts      # write_ltm, write_sltm, search_memory
│   │   │   ├── webTools.ts         # web_search (SearXNG)
│   │   │   ├── todoTools.ts        # todo() per-agent checklist
│   │   │   ├── reminderTools.ts    # set_reminder, list_reminders
│   │   │   └── dateTools.ts        # get_current_date
│   │   ├── pm/                 # PM-exclusive tools
│   │   │   ├── taskTools.ts        # create_task, list_all_tasks, releaseDueTasks
│   │   │   └── employeeTools.ts    # hire_agent, fire_agent, list_employees
│   │   └── domain/             # Specialist domain tools
│   │       ├── baseSpecialistTools.ts  # read_task_details, update_my_task, read_task_messages
│   │       ├── gitTools.ts             # git_status, git_commit, git_push, autoInitRepo
│   │       ├── baFileTools.ts          # BA-specific document tools
│   │       ├── baTools.ts              # Business analysis tools
│   │       ├── devTools.ts             # Developer workflow tools
│   │       ├── qaTools.ts              # QA test execution tools
│   │       ├── securityFlowTools.ts    # Security scan tools
│   │       ├── marketingTools.ts       # SEO, social, GEO tools
│   │       └── productivityTools.ts    # Excel, presentation, PDF, document tools
│   ├── channels/           # External messaging adapters (16 platforms)
│   │   ├── channelManager.ts   # Singleton: init/stop/restart channels
│   │   ├── channelConfig.ts    # Channel IDs, labels, credential persistence
│   │   ├── activeChannel.ts    # Current channel state tracker
│   │   ├── types.ts            # VECChannel interface
│   │   ├── telegram.ts
│   │   ├── slack.ts
│   │   ├── discord.ts
│   │   ├── whatsapp.ts
│   │   ├── teams.ts
│   │   ├── matrix.ts
│   │   ├── signal.ts
│   │   ├── googlechat.ts
│   │   ├── irc.ts
│   │   ├── line.ts
│   │   ├── mattermost.ts
│   │   ├── twitch.ts
│   │   ├── nostr.ts
│   │   ├── nextcloud.ts
│   │   ├── synology.ts
│   │   └── feishu.ts
│   ├── dashboard/          # Express + WebSocket server + React SPA APIs
│   │   ├── server.ts           # All REST endpoints, SSE, WebSocket
│   │   ├── auth.ts             # JWT access/refresh token logic
│   │   ├── security.ts         # Auth middleware, CORS, rate limits
│   │   ├── mobileApi.ts        # Mobile app pairing + approval API
│   │   ├── gitConfig.ts        # Git config + memory backup API
│   │   └── relayClient.ts      # Cloud relay WebSocket client
│   ├── integrations/       # Third-party integration configuration
│   │   └── integrationConfig.ts  # SearXNG, SonarQube env injection
│   ├── mcp/                # Model Context Protocol bridge
│   │   └── mcpBridge.ts        # MCP server spawn + tool discovery
│   ├── flows/              # Automated security scan pipelines
│   │   ├── index.ts            # runFlow() dispatcher
│   │   ├── codeScanFlow.ts     # SonarQube scan
│   │   ├── gitleaksScanFlow.ts # Secret detection
│   │   ├── semgrepScanFlow.ts  # SAST scan
│   │   └── trivyScanFlow.ts    # Dependency vulnerability scan
│   └── types/              # Shared TypeScript type declarations
├── core/                   # Read-only shipped assets (never modified at runtime)
│   ├── roster.json         # Default agent roster (seeded to ~/.octo-vec/roster.json)
│   └── prompts/            # System prompt markdown templates (one per role)
│       ├── pm.md, dev.md, ba.md, architect.md, qa.md, security.md, ...
│       └── (30+ role prompt files)
├── dashboard/              # React SPA source + build output
│   └── dist/               # Built dashboard (served by Express)
├── mobile/                 # React Native mobile app
├── relay/                  # Cloud relay server (optional, for remote access)
├── docker/                 # Docker config for security scan tools
├── docker-compose.yml      # Orchestrates SonarQube + SearXNG + scan tools
├── scripts/                # Install scripts (install.sh, install.ps1)
├── docs/                   # Documentation
├── landing/                # Landing page source
├── shared/                 # Shared utilities (cross-package)
├── package.json            # Node package manifest
├── tsconfig.json           # TypeScript config (src/)
└── tsconfig.build.json     # Build-specific TS config
```

---

## Directory Purposes

**`src/agents/`:**
- Purpose: Houses `PMAgent` — the orchestrator agent with unique tool set (task creation, employee management)
- Key files: `src/agents/pmAgent.ts`
- Note: All non-PM specialists use `BaseSpecialistAgent` in `src/ar/` instead of separate files

**`src/ar/`:**
- Purpose: Agent Registry — creates agent instances from `roster.json` data, loads prompts, builds toolsets
- Key files: `src/ar/baseSpecialist.ts` (agent implementation), `src/ar/roster.ts` (JSON loader/mutator), `src/ar/toolProfiles.ts` (tool assembly), `src/ar/promptLoader.ts` (markdown template loader)

**`src/atp/`:**
- Purpose: Agent Task Portal — all coordination primitives; the "OS" of the multi-agent system
- Key files: `src/atp/database.ts` (SQLite), `src/atp/inboxLoop.ts` (VECAgent + polling), `src/atp/agentRuntime.ts` (lifecycle), `src/atp/agentStreamBus.ts` (SSE bus), `src/atp/agentMessageQueue.ts` (messaging)

**`src/memory/`:**
- Purpose: Agent memory subsystem — three tiers of persistence (SLTM, LTM, conversation history) plus compaction
- Key files: `src/memory/agentMemory.ts`, `src/memory/autoCompaction.ts`, `src/memory/sessionLifecycle.ts`

**`src/tools/`:**
- Purpose: All LLM-callable tools assembled per-agent via `buildToolset()` in `src/ar/toolProfiles.ts`
- Convention: Tool functions return `AgentTool[]` arrays; named `get*Tools()` or exported as constants

**`src/channels/`:**
- Purpose: Inbound messaging from 16 external platforms; each adapter calls `pmAgent.inbox.send("user", "pm", msg, "priority")`
- All channels implement the `VECChannel` interface from `src/channels/types.ts`

**`src/dashboard/`:**
- Purpose: Web UI backend — Express server, REST APIs, SSE token stream, auth
- All API routes are in `src/dashboard/server.ts`; auth logic in `src/dashboard/auth.ts`

**`core/`:**
- Purpose: Shipped read-only assets; never written at runtime
- `core/roster.json` is copied to `~/.octo-vec/roster.json` on first run; user's copy is what gets modified
- `core/prompts/*.md` are loaded by `src/ar/promptLoader.ts`; variables are `{{name}}`, `{{role}}`, etc.

---

## Key File Locations

**Entry Points:**
- `src/tower.ts`: Main process entry — `startServer()` function
- `package.json` `bin.octo-vec`: Points to compiled `dist/tower.js`

**Configuration:**
- `src/config.ts`: All runtime config via `export const config = {...}`; reads env vars
- `~/.octo-vec/roster.json` (runtime): Mutable agent roster; seeded from `core/roster.json`
- `~/.octo-vec/settings.json` (runtime): Persisted workspace path override
- `~/.octo-vec/model-config.json` (runtime): Per-agent model overrides
- `~/.octo-vec/mcp-servers.json` (runtime): MCP server definitions

**Core Logic:**
- `src/atp/inboxLoop.ts`: The `startInboxLoop()` function and `VECAgent` interface
- `src/ar/baseSpecialist.ts`: `BaseSpecialistAgent` — `executeTask()`, `prompt()`, `followUp()`, `steer()`
- `src/agents/pmAgent.ts`: `PMAgent` — PM-specific tools and system prompt
- `src/atp/agentRuntime.ts`: `AgentRuntime.addAgent()`, `pauseAgent()`, `removeAgent()`

**Schema/Models:**
- `src/atp/models.ts`: All core TypeScript interfaces and enums (`Task`, `Employee`, `AgentMessage`, `Event`, `EventType`)
- `src/ar/roster.ts`: `RosterEntry`, `RoleTemplate`, `Roster` interfaces

**Database:**
- `src/atp/database.ts`: `ATPDatabaseClass` singleton; all task/employee/reminder CRUD
- Runtime file: `~/.octo-vec/atp.db`

**Testing:**
- No test files detected in the codebase

---

## Naming Conventions

**Files:**
- camelCase for modules: `agentRuntime.ts`, `messageQueue.ts`, `toolProfiles.ts`
- PascalCase for class-focused files matches class name: `BaseSpecialistAgent` in `baseSpecialist.ts`

**Directories:**
- lowercase, short noun: `atp/`, `ar/`, `memory/`, `tools/`, `channels/`

**Exports:**
- Classes: PascalCase — `PMAgent`, `AgentRuntime`, `BaseSpecialistAgent`
- Singletons: PascalCase — `ATPDatabase`, `MessageQueue`, `AgentMessageQueue`, `EventLog`
- Functions: camelCase — `startInboxLoop`, `loadAgentMemory`, `buildToolset`
- Interfaces: PascalCase — `VECAgent`, `RosterEntry`, `SpecialistDeps`

---

## Module Boundaries and Responsibilities

**`src/atp/` owns all shared state.** Other modules import from here; `atp/` does not import from `agents/`, `ar/`, or `tools/`.

**`src/ar/` is the agent factory.** Only `tower.ts` and `atp/agentRuntime.ts` instantiate agents. Agents do not create other agents.

**`src/tools/` is pure tool definition.** Tool files return `AgentTool[]` arrays. They call into `atp/` (database, queues) but never into `ar/` or `agents/`.

**`src/channels/` is input-only.** Channel adapters write to `AgentMessageQueue` and update `ActiveChannelState`. They do not read task state or call agent methods directly.

**`src/memory/` is stateless.** Functions read/write files and return strings. No singleton state.

**`src/dashboard/` is output + control.** Reads from all ATP data structures; calls `AgentRuntime` for lifecycle operations; does not execute agent logic directly.

**`core/` is immutable at runtime.** Never write to `core/`. Prompt/roster changes go to `~/.octo-vec/`.

---

## How Source Files Map to Runtime Components

| Source File | Runtime Component |
|-------------|-------------------|
| `src/tower.ts` | Node.js process, main event loop |
| `src/agents/pmAgent.ts` | Single `PMAgent` instance (singleton) |
| `src/ar/baseSpecialist.ts` | N instances of `BaseSpecialistAgent` (one per enabled roster entry) |
| `src/atp/agentRuntime.ts` | Single `AgentRuntime` instance |
| `src/atp/inboxLoop.ts` | N+1 `setInterval` handles (one per specialist + PM proactive) |
| `src/atp/database.ts` | SQLite connection to `~/.octo-vec/atp.db` |
| `src/atp/agentMessageQueue.ts` | In-memory queue backed to `~/.octo-vec/agent_messages.json` |
| `src/atp/agentStreamBus.ts` | Node.js `EventEmitter` singleton |
| `src/dashboard/server.ts` | Express HTTP server on port 3000 (default) |
| `src/channels/*.ts` | 0–16 active channel instances (only those with credentials start) |
| `src/mcp/mcpBridge.ts` | 0–N child processes (one per configured MCP server) |

---

## Where to Add New Code

**New specialist agent role:**
1. Add role template to `core/roster.json` under `role_templates`
2. Add roster entry under `agents[]`
3. Create prompt file at `core/prompts/{role}.md`
4. If new domain tools needed: add `src/tools/domain/{role}Tools.ts`, register in `DOMAIN_TOOL_BUNDLES` in `src/ar/toolProfiles.ts`
5. No new agent class needed — `BaseSpecialistAgent` handles it via `tool_profile` and `domain_tools`

**New tool (all agents):**
- Add to `src/tools/shared/` as `get*Tools(): AgentTool[]`
- Register in `buildToolset()` in `src/ar/toolProfiles.ts` for specialists; add directly in `PMAgent` constructor for PM

**New PM-only tool:**
- Add to `src/tools/pm/`
- Register in `PMAgent` constructor in `src/agents/pmAgent.ts`

**New external channel:**
- Implement `VECChannel` interface from `src/channels/types.ts`
- Add `createXxxChannel(pmAgent)` factory function
- Register in `CREATORS` map in `src/channels/channelManager.ts`
- Add channel ID to `ALL_CHANNEL_IDS` in `src/channels/channelConfig.ts`

**New REST API endpoint:**
- Add route handler in `src/dashboard/server.ts`
- Wrap with `authMiddleware` for authenticated endpoints

**New security flow (post-task scan):**
- Create `src/flows/{name}Flow.ts`
- Register flow name in `src/flows/index.ts` dispatcher
- Add flow name to `scansToRun` array in `src/atp/postTaskHooks.ts`

**New memory tool (write/read agent memory):**
- Extend `src/tools/shared/memoryTools.ts`
- Memory files live at `~/.octo-vec/memory/{agentId}/`

---

## Special Directories

**`~/.octo-vec/` (runtime data root):**
- Purpose: All mutable runtime state for a user's installation
- Generated: Yes (created on first run)
- Committed: No (user-specific)

**`core/` (shipped assets):**
- Purpose: Default roster + prompt templates shipped with the npm package
- Generated: No (hand-authored)
- Committed: Yes

**`dashboard/dist/` (React build output):**
- Purpose: Compiled React SPA served by Express
- Generated: Yes (`npm run build:dashboard`)
- Committed: Yes (pre-built for npm install without build step)

**`workspace/` (agent working directory):**
- Purpose: Where agents read/write files; `workspace/shared/` for cross-agent deliverables; `workspace/agents/{EMP-ID}/` for per-agent private folders
- Default path: `{cwd}/workspace`, overridable via `VEC_WORKSPACE` env or dashboard settings
- Generated: Yes (created on startup)
- Committed: No (user project files)

---

*Structure analysis: 2026-04-14*
