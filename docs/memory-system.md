# Memory System

VEC agents have a **three-tier memory architecture** that persists knowledge between sessions. All memory is stored as plain Markdown files, making it human-readable and grep-searchable.

Memory files live in `memory/<agentId>/`.

---

## The Three Tiers

### STM — Short-Term Memory

**File:** `memory/<agentId>/stm.md`
**Purpose:** Daily scratchpad. Resets every day.
**Max entries:** 20
**Use for:** Current task notes, temporary context, things to remember today.

```markdown
# STM - Short-Term Memory
## 2026-02-25
- Working on TASK-042: authentication module
- Reminder: check the shared/auth-spec.md before starting
- PM wants tests included
```

**Tools:** `read_stm`, `write_stm`, `append_stm`

---

### LTM — Long-Term Memory

**File:** `memory/<agentId>/ltm/YYYY-MM-DD_memory.md`
**Purpose:** Daily journal. One file per day. Accumulates over time.
**Use for:** What tasks were completed, what was learned, important decisions made.

```markdown
# LTM - 2026-02-25
- Completed TASK-040: Built the user login API
- Learned: always use bcrypt with rounds >= 12
- TASK-041 failed: DB schema mismatch, PM notified
```

**Tools:** `read_ltm(date?)`, `write_ltm`, `append_ltm`

Reading without a date defaults to today. Pass `YYYY-MM-DD` to read a past entry.

---

### SLTM — Super-Long-Term Memory

**File:** `memory/<agentId>/sltm.md`
**Purpose:** Permanent identity and knowledge. Never resets.
**Use for:** Core skills, key facts about the project, how you prefer to work, things you must never forget.

```markdown
# SLTM - Permanent Memory

## Who I Am
Rohan Mehta, Senior Developer at VEC. I write clean, practical code.

## Project Knowledge
- Main stack: TypeScript, Node.js, SQLite
- Workspace: D:\Akhil\VEC_PROJECT_SPACE
- Always read files before editing

## Key Lessons
- Never leave tasks in in_progress — either complete or fail them
- Use bcrypt for passwords, never plain text
```

**Tools:** `read_sltm`, `write_sltm`, `append_sltm`

---

## Memory Loading

Memory is **automatically injected** into every agent prompt via `src/memory/agentMemory.ts`.

### What Gets Loaded

```
Every LLM prompt includes:
  1. SLTM (permanent memory — always)
  2. Yesterday's LTM (for continuity)
  3. Today's LTM (for current session context)
```

The loader (`loadAgentMemory`) reads all three files and formats them into a markdown block prepended to the prompt.

### First Interaction Detection

```typescript
isFirstInteraction(agentId: string): boolean
markFirstInteractionDone(agentId: string): void
```

On first ever interaction, a `.first_contact_done` marker file is created in the agent's memory folder. This lets the system give new agents an onboarding prompt.

### Memory Search

```typescript
searchAgentMemory(agentId: string, query: string): string
```

Grep-style search across all memory files (STM, LTM journal files, SLTM). Useful for agents to retrieve past context.

---

## Conversation History

Agent LLM conversation history is **separate from memory files** — it's the raw message array that the LLM uses as context.

**Files:** `data/agent-history/<agentId>.json`
**Format:** pi-agent-core message format (array of `{ role, content }` objects)

### Functions (`src/memory/messageHistory.ts`)

```typescript
saveAgentHistory(agentId: string, messages: Message[]): void
loadAgentHistory(agentId: string): Message[]
clearAgentHistory(agentId: string): void
```

- History is **saved after every prompt** (auto-persistence)
- History is **restored on startup** (agents remember their last conversation)
- `/forget` command calls `clearAgentHistory("pm")` to wipe PM's history

---

## Session Lifecycle — Sunset & Sunrise

**File:** `src/memory/sessionLifecycle.ts`

At startup the system checks whether the PM has stale conversation history from a previous day. If it does, it runs a **sunset** routine to journal that session's events into memory before clearing history. On the next start the PM wakes up with empty conversation history but all relevant knowledge pre-loaded from memory — the **sunrise** state.

Only the PM gets sunset/sunrise. Specialist agents (Dev, BA, etc.) clear their conversation history before every task anyway, so they don't need this.

### Day-Boundary Detection

```typescript
shouldRunSunset(agentId: string): { should: boolean; sessionDate?: string }
```

The history file's `mtime` (last-modified date) is compared to today's date. If `mtime < today`, the session is stale and sunset should run.

### Sunset Flow

```
tower.ts startup:
  1. shouldRunSunset("pm") → stale session detected
  2. pmAgent.runSunset(sessionDate)
       ├─ Force ALL tools on (bypass tool config — memory tools must be available)
       ├─ Build sunset prompt:
       │    - "The conversation history above is YOUR real session from [date]"
       │    - "Read through that actual conversation — not from memory, from the messages above"
       │    - write_ltm: concrete journal (what Sir asked, tasks created/completed/failed,
       │                  decisions, follow-ups, reflection)
       │    - write_sltm (optional): lasting learnings worth keeping forever
       │    - "Base everything on the actual messages above. Do not summarise from assumptions."
       │    - Model must respond with SUNSET_COMPLETE
       ├─ On any failure: log warning, continue (non-fatal)
       └─ Finally: clear in-memory history + clear disk history file
```

The sunset prompt is explicit about grounding the model in its actual conversation messages, not its priors. This prevents the model from writing fabricated journal entries.

### Sunrise Flow

After sunset completes (or if no stale session exists), the PM starts with empty conversation history. The existing `loadAgentMemory()` call automatically injects:

- SLTM (permanent memory — always loaded)
- Yesterday's LTM (written during sunset — the fresh journal of the previous session)
- Today's LTM (empty at start of day)

The PM therefore wakes up **informed but clean**: no stale conversation context, but all key decisions and task outcomes from yesterday are available in the prompt via LTM.

### Placement in `tower.ts`

```typescript
// Between step 6 (attach streaming) and step 7 (start inbox loops):
const sunsetCheck = shouldRunSunset("pm");
if (sunsetCheck.should && sunsetCheck.sessionDate) {
  await pmAgent.runSunset(sunsetCheck.sessionDate);
}
```

Sunset runs synchronously before any inbox loops start, so no messages are processed while the PM is journaling.

---

## History Compaction (`src/memory/compaction.ts`)

Conversation history can grow too large for the LLM context window. The compaction system trims old messages.

```typescript
makeCompactionTransform(maxMessages: number): (messages: Message[]) => Message[]
```

**Rules:**
- Keep the most recent `maxMessages` messages
- Never cut mid-tool-exchange (finds first clean user message boundary)
- Tool call + tool result pairs are kept together

The transform is applied before each prompt to keep context under the model's limit.

---

## Memory Directory Structure

```
memory/
├── pm/
│   ├── sltm.md
│   ├── stm.md
│   ├── .first_contact_done
│   └── ltm/
│       ├── 2026-02-24_memory.md
│       └── 2026-02-25_memory.md
├── dev/
│   ├── sltm.md
│   ├── stm.md
│   └── ltm/
│       └── ...
└── ba/
    └── ...
```

---

## Design Philosophy

The memory system follows an **"OpenClaw-style"** approach:
- All memory is **plain Markdown** — readable by humans without any tooling
- Files are **grep-searchable** — agents can search their own memory
- **No database** for memory — just files
- Memory tools are **simple string operations** — append, overwrite, read
- The system is **explicit** — agents must consciously write to memory (nothing is auto-saved from conversation history)

This keeps memory transparent, inspectable, and easy to debug.
