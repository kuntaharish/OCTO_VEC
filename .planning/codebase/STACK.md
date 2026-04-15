# Technology Stack

**Analysis Date:** 2026-04-14

## Languages

**Primary:**
- TypeScript 5.7.3 — all server-side source (`src/**/*.ts`), dashboard (`dashboard/`), mobile (`mobile/`)
- JavaScript (CommonJS) — relay server only (`relay/server.js`)

**Secondary:**
- None. All new feature code is TypeScript.

## Runtime

**Environment:**
- Node.js >= 20.0.0 (required; active runtime is v22.20.0)
- ESM-first: root `package.json` sets `"type": "module"`. All imports use `.js` extensions.

**Package Manager:**
- npm 10.9.3
- Lockfile: `package-lock.json` present at root, `dashboard/package-lock.json` for dashboard sub-package

## Frameworks

**Core (server / orchestrator):**
- Express 4.21.0 — HTTP API server and dashboard backend (`src/dashboard/server.ts`)
- `ws` 8.19.0 — WebSocket server (dashboard live stream) and relay client (`src/dashboard/relayClient.ts`)

**Dashboard frontend:**
- React 18.3.1 + React DOM 18.3.1 (`dashboard/`)
- Vite 6.0.0 — build tool and dev server (`dashboard/vite.config.ts`)
- Tailwind CSS 3.4.0 — utility CSS (`dashboard/`)
- `@monaco-editor/react` 4.7.0 — in-browser code editor
- `@xterm/xterm` 6.0.0 + `@xterm/addon-fit` 0.11.0 — embedded terminal
- `react-markdown` 10.1.0 + `remark-gfm` 4.0.1 — markdown rendering
- `lucide-react` 0.575.0 — icon library
- `qrcode` 1.5.4 — QR code generation (mobile pairing)

**Mobile (Android):**
- React Native 0.74.5 (`mobile/`)
- React Navigation 6.x (native-stack, bottom-tabs)
- `@notifee/react-native` 9.1.8 — push notifications
- `react-native-encrypted-storage` 4.0.3 — secure credential storage
- `react-native-background-actions` 4.0.1 — background service

**Testing:**
- Not detected — no test runner configuration found in any `package.json`

**Build/Dev:**
- `tsx` 4.19.2 — TypeScript execution in dev (`npm run dev` / `npm start`)
- TypeScript compiler (`tsc`) — production build via `tsconfig.build.json`
  - Target: `ES2022`, module: `NodeNext`, outputs to `dist/`
- `@vitejs/plugin-react` 4.3.4 — Vite React plugin for dashboard build
- Autoprefixer + PostCSS — CSS post-processing for Tailwind

## AI / Agent Framework

**Core AI library:**
- `@mariozechner/pi-agent-core` 0.53.1 — `Agent` class, `AgentEvent`, `AgentTool`, `AgentMessage` types
- `@mariozechner/pi-ai` 0.54.0 — `getModel()`, `Type` (TypeBox), model registry (`MODELS`), `getEnvApiKey()`
- `@mariozechner/pi-coding-agent` 0.53.1 — coding-specialized agent variant

**MCP (Model Context Protocol):**
- `@modelcontextprotocol/sdk` 1.27.1 — `Client`, `StdioClientTransport` for connecting to external MCP servers (`src/mcp/mcpBridge.ts`)

## Key Dependencies

**Database:**
- `better-sqlite3` 12.8.0 — embedded SQLite, WAL mode enabled
  - DB file: `~/.octo-vec/atp.db` (or `%APPDATA%/octo-vec/atp.db` on Windows)

**HTTP security:**
- `helmet` 8.1.0 — HTTP security headers
- `express-rate-limit` 8.3.1 — rate limiting for mutations and login endpoints
- `cors` 2.8.6 — CORS middleware
- `cookie-parser` 1.4.7 — cookie parsing for JWT auth

**Auth:**
- `jsonwebtoken` 9.0.3 — JWT access/refresh token issuance (1h / 7d expiry)

**Document generation:**
- `docx` 9.6.1 — Word document creation
- `exceljs` 4.4.0 — Excel spreadsheet creation
- `pdfkit` 0.18.0 — PDF generation
- `pptxgenjs` 4.0.1 — PowerPoint generation

**Config / env:**
- `dotenv` 17.3.1 — loads `.env` at startup via `import "dotenv/config"` in `src/config.ts`
- `commander` 14.0.3 — CLI argument parsing

**Optional:**
- `node-pty` 1.1.0 — pseudo-terminal for terminal emulation in dashboard

## Configuration

**Environment:**
- Primary config file: `.env` (loaded by `dotenv`). Template: `.env.example`
- Runtime config is read in `src/config.ts` and exported as the `config` object
- Runtime overrides persisted to `~/.octo-vec/settings.json`
- Integration credentials persisted to `~/.octo-vec/integration-config.json`
- Channel credentials persisted to `~/.octo-vec/channel-config.json`
- Model config persisted to `~/.octo-vec/model-config.json`
- API keys persisted to `~/.octo-vec/api-keys.json`

**Key env vars (from `.env.example` and `src/config.ts`):**
- `GROQ_API_KEY` — default LLM provider key
- `VEC_MODEL_PROVIDER` — override provider (default: `groq`)
- `VEC_MODEL` / `GROQ_MODEL` — model ID (default: `moonshotai/kimi-k2-instruct-0905`)
- `VEC_DATA_DIR` — override user data directory
- `VEC_WORKSPACE` — override agent workspace path
- `VEC_DASHBOARD_PORT` — dashboard HTTP port (default: `3000`)
- `VEC_THINKING_LEVEL` — agent thinking depth (`off`/`minimal`/`low`/`medium`/`high`/`xhigh`)
- `VEC_CLI_ENABLED` — enable/disable readline loop (default: `1`)
- `VEC_CONTEXT_WINDOW` — model context window in tokens (default: `128000`)

**Build:**
- Dev TypeScript config: `tsconfig.json` (bundler module resolution, `noEmit: true`)
- Build TypeScript config: `tsconfig.build.json` (NodeNext resolution, emits to `dist/`)
- Dashboard config: `dashboard/vite.config.ts` (dev proxy `/api` → `localhost:3000`)

## Platform Requirements

**Development:**
- Node.js >= 20.0.0 (tested on v22)
- npm >= 10
- Docker (optional, for SonarQube and SearXNG)
- Git (for agent git tools and memory backup)

**Production / Deployment:**
- Distributed as an npm package (`npm install -g octo-vec`)
- Binary entrypoint: `dist/tower.js` (compiled from `src/tower.ts`)
- Packages: `dist/`, `core/`, `dashboard/dist/`
- Relay server (`relay/`) is a standalone Node.js script deployable on any VPS
- Mobile app (`mobile/`) builds to Android APK via Gradle

---

*Stack analysis: 2026-04-14*
