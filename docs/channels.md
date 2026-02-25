# Channels

Channels are the interfaces through which humans interact with the VEC system. All channels implement the `VECChannel` interface.

```typescript
interface VECChannel {
  start(): Promise<void>;
  stop(): Promise<void>;
  sendToUser(text: string): Promise<void>;
}
```

---

## CLI (Built into `tower.ts`)

The command-line interface is the primary interaction channel. It uses Node.js's `readline` module.

### Features
- Interactive readline loop
- Slash commands for system control
- Live queue monitor toggle
- PM response streaming to console

### Slash Commands

| Command | Description |
|---|---|
| `/board` | Print full task board |
| `/queue` | Print PM message queue |
| `/events` | Print recent event log (last 20) |
| `/dir` | Print employee directory |
| `/org` | Print org chart |
| `/message <agent> <text>` | Send direct message to any agent |
| `/interrupt <agent>` | Request agent stop |
| `/forget` | Clear PM conversation history |
| `/live` | Toggle live queue monitor |
| `/quit` | Exit the process |

### Live Monitor
When toggled on with `/live`, prints a live view of the agent message queue every 2 seconds. Useful for watching agent-to-agent communication happen in real time.

### PM Streaming
The `attachPmStreaming()` function subscribes to PM's `AgentEvent` stream and prints tokens to the console as the PM LLM generates them:
- Text tokens print as they arrive
- Tool calls show `[calling: tool_name]`
- Tool results show `[result: ...]`

---

## Telegram Bot (`src/channels/telegram.ts`)

Optional Telegram integration using the [grammy](https://grammy.dev/) framework. Requires `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` in `.env`.

### Authorization
Only the configured `TELEGRAM_CHAT_ID` can interact with the bot. Positive IDs = private chat, negative IDs = group chat. All other users are rejected.

### Features
- All CLI slash commands available as Telegram commands
- PM responses streamed back to Telegram
- Message batching (Telegram max: 4096 chars per message)
- Routes messages through the same PM queue as CLI

### Supported Commands (in Telegram)
```
/board    — Task board
/queue    — PM queue
/events   — Event log
/dir      — Employee directory
/org      — Org chart
```

Any non-command text is forwarded to the PM as a user message.

### Response Flow
```
User sends Telegram message
    ↓
handleText() validates chat ID
    ↓
Message pushed to pm_queue.json
    ↓
PM processes it (same as CLI)
    ↓
PM events streamed via subscribeEvents()
    ↓
flushReply() batches tokens into messages ≤ 4096 chars
    ↓
Bot.api.sendMessage() sends back to Telegram
```

### Setup
1. Create a bot via [@BotFather](https://t.me/botfather)
2. Get your bot token
3. Get your chat ID (send `/start` to the bot, check `https://api.telegram.org/bot<TOKEN>/getUpdates`)
4. Add to `.env`:
   ```
   TELEGRAM_BOT_TOKEN=your_token_here
   TELEGRAM_CHAT_ID=your_chat_id_here
   ```

---

## Web Dashboard (`src/dashboard/server.ts`)

An Express HTTP server with a self-contained dark-theme dashboard.

**Port:** `VEC_DASHBOARD_PORT` (default: 3000)
**URL:** `http://localhost:3000`

### API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/` | Full dashboard HTML (self-contained, no CDN) |
| `GET` | `/api/tasks` | All ATP tasks as JSON |
| `GET` | `/api/employees` | All employees as JSON |
| `GET` | `/api/events` | Last 30 events as JSON |
| `GET` | `/api/queue` | PM message queue as JSON |
| `GET` | `/api/agent-messages` | Inter-agent message queue as JSON |
| `GET` | `/api/errors` | Recent errors with classification as JSON |
| `GET` | `/api/chat-log` | User ↔ agent chat history as JSON |
| `GET` | `/api/company` | Agent profiles + enabled tool lists as JSON |
| `POST` | `/api/send-message` | Send a message to any agent |
| `POST` | `/api/agent-config` | Save tool enable/disable config for an agent |
| `GET` | `/api/stream` | SSE endpoint for live LLM token streaming |

### Dashboard Views

The dashboard has a left icon sidebar with four views:

---

#### Dashboard View
Main operational overview. Auto-refreshes every 3 seconds.
- Task board with status badges (pending / in_progress / completed / failed)
- Recent event log
- PM message queue
- Agent status chips (idle / busy / thinking)
- Error log with classification

---

#### Teams View
A Microsoft Teams-style chat interface for talking to any agent directly.

- Left panel: list of all agents with live status indicators and unread badge
- Right panel: threaded chat history per agent, with timestamps and avatar chips
- Compose box with `Enter` to send / `Shift+Enter` for newline
- Typing indicator (animated dots) shown while agent is generating
- Messages route through `AgentMessageQueue` — same path as CLI

```
You type → POST /api/send-message → AgentMessageQueue.push()
                                         ↓
                           Instant wake → agent's inbox loop fires
                                         ↓
                        Agent LLM runs → streams tokens via SSE
                                         ↓
                   Dashboard receives stream → shows typing indicator
                                         ↓
                         Agent calls message_agent() → reply stored
                                         ↓
                      Auto-refresh picks up new message → displayed
```

---

#### Network View
An animated SVG visualization of the agent communication graph.

- Nodes: Founder (user), PM, BA, Dev — positioned in a hierarchical layout
- Edges: communication channels between agents (user↔pm, pm↔ba, pm↔dev, ba↔dev, etc.)
- Signal dots animate along edges to show message flow
- Clicking a node selects that agent's live LLM token stream
- Each agent has a distinct color (PM=blue, BA=purple, Dev=green)
- Active/thinking/tool states pulse visually

---

#### Company View (HR Portal)
The control panel for managing agent identities and tool access.

**Left panel — Agent Directory:**
- Lists all 9 VEC employees grouped by department
- Stats chips: total employees, active count, department count
- Click any employee to open their profile
- Implemented agents show a colored dot; "Coming Soon" agents are greyed

**Right panel — Agent Profile & Tool Access:**
- Agent avatar, name, role, department, implementation status
- Tool count chip: `N/M tools enabled`
- Per-tool toggles organized by group (Task Management, Files, Memory, Messaging, Utilities)
- **Locked tools** (`message_agent`, `read_inbox`) show a lock icon and "Always on" — no toggle rendered
- **All On / All Off** buttons for bulk toggle (skips locked tools)
- **Interrupt button** — visible for running agents; calls `POST /api/interrupt`
- **Save Changes button** — persists config to `data/agent-tool-config.json`

**How tool config is applied:**
```
Dashboard saves → data/agent-tool-config.json
                        ↓
Agent's next prompt() or executeTask() call
                        ↓
applyToolConfig(agentId, allTools) reads the file
                        ↓
Disabled tools: kept in schema (no hallucination) but
                execute() returns "Tool disabled" error
Locked tools:   always pass through, never blocked
```

**API:**
```
GET  /api/company          → agent profiles + current enabledTools[]
POST /api/agent-config     → { agent_id, tools: string[] } → saves config
                             (server re-adds locked tools even if client omits them)
```

---

### SSE Stream (`/api/stream`)

The stream endpoint uses `agentStreamBus.ts` to push live tokens to the browser:

```
Client connects to GET /api/stream
    ↓
Server holds the connection open (SSE)
    ↓
When any agent LLM call produces tokens:
    publishAgentStream(agentId, event) → emits StreamToken
    ↓
Server writes "data: {json}\n\n" to SSE stream
    ↓
Browser receives token, renders in Stream tab / Teams typing indicator
```

Token types:
- `text` — LLM text output
- `thinking` — Extended thinking tokens (if enabled)
- `tool_call` — Agent is calling a tool
- `tool_result` — Tool returned a result
- `error` — LLM or tool error
- `done` — Agent finished

---

### Error Classification

The `/api/errors` endpoint classifies errors from the event log:

| Category | Triggers |
|---|---|
| `rate_limit` | "rate limit", "429" in message |
| `timeout` | "timeout", "timed out" |
| `network` | "network", "ECONNREFUSED", "ECONNRESET" |
| `quota` | "quota", "billing" |
| `crashed` | "crashed", "fatal" |
| `generic` | Anything else |

---

### Sending Messages from Dashboard
The `POST /api/send-message` endpoint accepts:
```json
{
  "agent": "pm",
  "message": "What's the status of TASK-001?"
}
```
Routes through the same PM queue or agent message queue as CLI. Triggers the debounced inbox waker — rapid messages within `VEC_DEBOUNCE_MS` are batched into one agent turn.
