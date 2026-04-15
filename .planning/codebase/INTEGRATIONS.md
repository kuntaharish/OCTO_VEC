# External Integrations

**Analysis Date:** 2026-04-14

## LLM Providers

OCTO VEC supports 22 LLM providers via `@mariozechner/pi-ai`. All providers are configured
through env vars or the dashboard UI (persisted to `~/.octo-vec/api-keys.json`).

**Provider registry:** `src/atp/modelConfig.ts`

| Provider | Env Var | Notes |
|---|---|---|
| Groq | `GROQ_API_KEY` | **Default provider**; default model `moonshotai/kimi-k2-instruct-0905` |
| Anthropic | `ANTHROPIC_API_KEY` | Claude models |
| OpenAI | `OPENAI_API_KEY` | GPT models |
| OpenAI Codex | `OPENAI_API_KEY` | OAuth flow via `~/.octo-vec/codex-oauth.json` (`src/atp/codexAuth.ts`) |
| Google Gemini | `GEMINI_API_KEY` | Also used by `google-antigravity`, `google-gemini-cli` |
| Google Vertex AI | `GOOGLE_APPLICATION_CREDENTIALS` | — |
| Amazon Bedrock | `AWS_ACCESS_KEY_ID` | — |
| Azure OpenAI | `AZURE_OPENAI_API_KEY` | — |
| Mistral | `MISTRAL_API_KEY` | — |
| xAI (Grok) | `XAI_API_KEY` | — |
| OpenRouter | `OPENROUTER_API_KEY` | Multi-model gateway |
| Vercel AI Gateway | `AI_GATEWAY_API_KEY` | — |
| Cerebras | `CEREBRAS_API_KEY` | — |
| GitHub Copilot | `GITHUB_TOKEN` | — |
| Hugging Face | `HF_TOKEN` | — |
| MiniMax | `MINIMAX_API_KEY` | — |
| MiniMax CN | `MINIMAX_CN_API_KEY` | — |
| Kimi Coding | `KIMI_API_KEY` | — |
| ZhipuAI (GLM) | `ZAI_API_KEY` | — |

## Communication Channels

All channel integrations are in `src/channels/`. Each channel is optional; the system
starts only channels with credentials present. Channel credentials are persisted to
`~/.octo-vec/channel-config.json` and injected via `src/channels/channelConfig.ts`.

### Telegram
- File: `src/channels/telegram.ts`
- SDK: `grammy` 1.40.0
- Transport: Polling (long-poll)
- Required env vars: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`

### Slack
- File: `src/channels/slack.ts`
- SDK: `@slack/bolt` 4.6.0
- Transport: Socket Mode (WebSocket — no public URL needed)
- Required env vars: `SLACK_BOT_TOKEN` (xoxb-...), `SLACK_APP_TOKEN` (xapp-...), `SLACK_CHANNEL_ID`
- Slash command: `/vec`

### Discord
- File: `src/channels/discord.ts`
- SDK: `discord.js` 14.25.1
- Transport: WebSocket Gateway (no public URL needed)
- Required env vars: `DISCORD_BOT_TOKEN`, `DISCORD_CHANNEL_ID`

### WhatsApp
- File: `src/channels/whatsapp.ts`
- SDK: `@whiskeysockets/baileys` 7.0.0-rc.9
- Transport: WebSocket — QR code pairing on first run
- Auth persisted to: `~/.octo-vec/whatsapp-auth/`
- Required env vars: `WHATSAPP_AUTHORIZED_JID`

### Matrix
- File: `src/channels/matrix.ts`
- SDK: `matrix-bot-sdk` 0.8.0
- Transport: Matrix Client-Server API (any homeserver)
- Storage persisted to: `~/.octo-vec/matrix-store/`
- Required env vars: `MATRIX_HOMESERVER_URL`, `MATRIX_ACCESS_TOKEN`, `MATRIX_ROOM_ID`

### Mattermost
- File: `src/channels/mattermost.ts`
- SDK: `@mattermost/client` 11.4.0 + `ws` (WebSocket)
- Required env vars: `MATTERMOST_URL`, `MATTERMOST_BOT_TOKEN`, `MATTERMOST_CHANNEL_ID`, `MATTERMOST_AUTH_USER`

### IRC
- File: `src/channels/irc.ts`
- SDK: `irc-framework` 4.14.0
- Required env vars: `IRC_SERVER`, `IRC_PORT`, `IRC_NICKNAME`, `IRC_CHANNEL`, `IRC_AUTH_NICK`
- Optional: `IRC_USE_TLS` (default: `"true"`)

### Twitch
- File: `src/channels/twitch.ts`
- SDK: `tmi.js` 1.8.5
- Required env vars: `TWITCH_BOT_USERNAME`, `TWITCH_OAUTH_TOKEN`, `TWITCH_CHANNEL`, `TWITCH_AUTH_USER`

### Nostr
- File: `src/channels/nostr.ts`
- SDK: `nostr-tools` 2.23.3
- Protocol: NIP-04 DMs over WebSocket relay
- Required env vars: `NOSTR_PRIVATE_KEY`, `NOSTR_RELAY_URL`, `NOSTR_AUTH_PUBKEY`

### LINE
- File: `src/channels/line.ts`
- SDK: `@line/bot-sdk` 10.6.0
- Transport: Webhook (HTTP endpoint registered at `/api/line-webhook` in `src/dashboard/server.ts`)
- Required env vars: `LINE_CHANNEL_ACCESS_TOKEN`, `LINE_CHANNEL_SECRET`, `LINE_USER_ID`

### Microsoft Teams
- File: `src/channels/teams.ts`
- Transport: Incoming + Outgoing webhooks (no Azure Bot registration needed)
- Outgoing webhook endpoint: `/api/teams-webhook` in `src/dashboard/server.ts`
- Required env vars: `TEAMS_INCOMING_WEBHOOK_URL`, `TEAMS_OUTGOING_WEBHOOK_SECRET` (optional)

### Feishu / Lark
- File: `src/channels/feishu.ts`
- Transport: Webhook send + event subscription at `/api/feishu-webhook`
- Required env vars: `FEISHU_APP_ID`, `FEISHU_APP_SECRET`, `FEISHU_WEBHOOK_URL`, `FEISHU_VERIFICATION_TOKEN`

### Google Chat
- File: `src/channels/googlechat.ts`
- Transport: Webhook send + HTTP endpoint for receiving
- Required env vars: `GOOGLE_CHAT_WEBHOOK_URL`, `GOOGLE_CHAT_SPACE_ID` (optional)

### Signal
- File: `src/channels/signal.ts`
- Transport: `signal-cli` binary via JSON-RPC over stdin/stdout (external Java binary, not bundled)
- Required env vars: `SIGNAL_CLI_PATH`, `SIGNAL_PHONE_NUMBER`, `SIGNAL_RECIPIENT`

### Nextcloud Talk
- File: `src/channels/nextcloud.ts`
- Transport: REST API polling
- Required env vars: `NEXTCLOUD_URL`, `NEXTCLOUD_USERNAME`, `NEXTCLOUD_PASSWORD`, `NEXTCLOUD_ROOM_TOKEN`, `NEXTCLOUD_AUTH_USER`

### Synology Chat
- File: `src/channels/synology.ts`
- Transport: Incoming webhook + outgoing webhook at `/api/synology-webhook`
- Required env vars: `SYNOLOGY_CHAT_INCOMING_URL`, `SYNOLOGY_CHAT_OUTGOING_TOKEN`

## Web Search

- Service: SearXNG (self-hosted meta-search engine)
- File: `src/tools/shared/webTools.ts`
- Docker image: `searxng/searxng`; config: `docker/searxng/settings.yml`
- Default URL: `http://localhost:8888`
- Env var: `SEARXNG_URL`
- Integration config: `~/.octo-vec/integration-config.json` (via `src/integrations/integrationConfig.ts`)

## Code Quality & Security Scanning

All scanners run via Docker containers; no local installation required. Post-task scanning
is controlled by `VEC_POST_TASK_SCANS` env var (default: enabled).
Flows live in `src/flows/`. Integration config in `src/integrations/integrationConfig.ts`.

**SonarQube (static analysis):**
- Docker service: `sonarqube:community` (`docker-compose.yml`)
- Docker network: `vec-net`
- Default URL: `http://localhost:9000`
- Required env vars: `SONAR_HOST_URL`, `SONAR_TOKEN`, `SONAR_PROJECT_BASE_KEY`, `SONAR_SCANNER_IMAGE`
- Flow: `src/flows/codeScanFlow.ts`

**Gitleaks (secret scanning):**
- Docker image: `zricethezav/gitleaks:latest` (default)
- Flow: `src/flows/gitleaksScanFlow.ts`

**Semgrep (SAST):**
- Docker image: `semgrep/semgrep` (default)
- Flow: `src/flows/semgrepScanFlow.ts`

**Trivy (vulnerability scanning):**
- Docker image: `aquasec/trivy:latest` (default)
- Flow: `src/flows/trivyScanFlow.ts`

## MCP (Model Context Protocol)

- Bridge file: `src/mcp/mcpBridge.ts`
- SDK: `@modelcontextprotocol/sdk` 1.27.1
- Config format: `~/.octo-vec/mcp-servers.json` (same JSON format as Claude Code / Cursor)
- Transport: `StdioClientTransport` — spawns each MCP server as a subprocess
- Hot reload: `reloadMCP()` diffs running servers vs config without full restart
- MCP tools are namespaced as `mcp_{serverName}_{toolName}` and exposed to all agents

Example config format:
```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/some/path"],
      "env": { "SOME_KEY": "value" }
    }
  }
}
```

## Authentication & Security

**Dashboard auth:**
- Mechanism: JWT access + refresh tokens via `httpOnly` cookies
- Library: `jsonwebtoken` 9.0.3
- Implementation: `src/dashboard/auth.ts`
- Access token expiry: 1 hour; refresh token expiry: 7 days
- Master key: SHA-256 hashed and stored in `~/.octo-vec/dashboard-secret.key`
- JWT secrets: random keys auto-generated in `~/.octo-vec/jwt-secret.key` and `~/.octo-vec/jwt-refresh-secret.key`
- API key auth also supported via `?key=` query param (for mobile app / relay)

**HTTP security middleware (`src/dashboard/security.ts`):**
- `helmet` 8.1.0 — security headers
- `express-rate-limit` 8.3.1 — separate limiters for mutations and login
- `cors` 2.8.6 — configurable CORS

**Codex OAuth:**
- File: `src/atp/codexAuth.ts`
- Credentials stored in `~/.octo-vec/codex-oauth.json`
- Used only when `VEC_MODEL_PROVIDER=openai-codex`

## Git Integration

**Purpose:** Agent git operations (commit, push) and memory backup
- File: `src/dashboard/gitConfig.ts`
- Config persisted to: `~/.octo-vec/git-config.json`
- Supported providers: GitHub, GitLab, Bitbucket, custom
- Auth: Personal Access Token (PAT) stored in config file
- Backup: pushes `~/.octo-vec/memory/` to a configured git remote on a schedule

## Mobile App & Relay

**Mobile app:** `mobile/` — React Native 0.74.5, Android only
- Communicates with dashboard HTTP API
- Push notifications via `@notifee/react-native` 9.1.8
- Secure credential storage via `react-native-encrypted-storage` 4.0.3
- QR code pairing flow for device registration

**Relay server:** `relay/server.js` — standalone Node.js WebSocket relay
- Enables remote access to a local dashboard without inbound ports
- Protocol: outbound WebSocket from `src/dashboard/relayClient.ts` to relay
- Auth: shared secret (`RELAY_SECRET`)
- Config required: `VEC_RELAY_URL`, `VEC_RELAY_SECRET`, `VEC_RELAY_SESSION_ID`
- Uses `ws` 8.16.0

## Data Storage

**Databases:**
- SQLite via `better-sqlite3` 12.8.0
  - File: `~/.octo-vec/atp.db`
  - Tables: `tasks`, `employees`, `reminders`, `events`, `message_queue`, chat logs

**File Storage:**
- Local filesystem only — all agent workspace files written to `VEC_WORKSPACE` (default: `./workspace`)
- Memory/conversation history: `~/.octo-vec/memory/`
- Config/state files: `~/.octo-vec/*.json`, `~/.octo-vec/*.key`

**Caching:**
- None — no Redis or in-memory cache layer

## Monitoring & Observability

**Error tracking:** None (no external service; errors classified and stored in SQLite `events` table)

**Token usage tracking:**
- File: `src/atp/tokenTracker.ts`
- Persisted to: `~/.octo-vec/token-usage.json`
- Budget config: `~/.octo-vec/budget-config.json`
- Exposed in dashboard finance view

**Logs:** `console.log`/`console.error` to stdout — no structured logging or log aggregation

## CI/CD & Deployment

**Hosting:** Distributed via npm (`npm install -g octo-vec`)
**CI Pipeline:** Not detected — no GitHub Actions, CircleCI, or similar config found
**Docker:** `docker-compose.yml` for SonarQube service only; `docker/searxng/` for SearXNG config
**Relay deployment:** Any VPS with Node.js — run `node relay/server.js`

## Dependencies Declared But Unused in Source

- `jsforce` 3.10.14 — declared in `package.json` but not imported in any `.ts` source file

---

*Integration audit: 2026-04-14*
