/**
 * MCP Server Directory — curated registry of popular MCP servers.
 *
 * Each entry has enough info to:
 *   1) display a card (name, description, tools, category, icon)
 *   2) auto-generate the mcp-servers.json config when the user clicks "Add"
 */

export interface MCPDirectoryEntry {
  /** Unique slug used as the server name in mcp-servers.json */
  id: string;
  name: string;
  description: string;
  category: MCPCategory;
  /** npm package (npx -y <pkg>) or docker image */
  package: string;
  /** The runtime command */
  command: string;
  /** Default args (user can edit before adding) */
  args: string[];
  /** Env vars required (key = var name, value = placeholder hint) */
  envVars: Record<string, string>;
  /** Representative tool names this server exposes */
  tools: string[];
  /** Optional URL to docs / GitHub */
  docsUrl?: string;
}

export type MCPCategory =
  | "files"
  | "dev-tools"
  | "browser"
  | "search"
  | "database"
  | "productivity"
  | "cloud"
  | "design"
  | "communication"
  | "ai"
  | "other";

export const CATEGORY_META: Record<MCPCategory, { label: string; color: string }> = {
  "files":         { label: "Files",         color: "var(--green)" },
  "dev-tools":     { label: "Dev Tools",     color: "var(--accent)" },
  "browser":       { label: "Browser",       color: "var(--blue)" },
  "search":        { label: "Search",        color: "var(--orange)" },
  "database":      { label: "Database",      color: "var(--purple)" },
  "productivity":  { label: "Productivity",  color: "var(--yellow)" },
  "cloud":         { label: "Cloud",         color: "var(--blue)" },
  "design":        { label: "Design",        color: "var(--pink, var(--red))" },
  "communication": { label: "Communication", color: "var(--blue)" },
  "ai":            { label: "AI",            color: "var(--accent)" },
  "other":         { label: "Other",         color: "var(--text-muted)" },
};

const MCP_DIRECTORY: MCPDirectoryEntry[] = [
  // ── Files ──────────────────────────────────────────────────────────────────
  {
    id: "filesystem",
    name: "Filesystem",
    description: "Secure file operations — read, write, search, and navigate directories with configurable access controls.",
    category: "files",
    package: "@modelcontextprotocol/server-filesystem",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-filesystem", "./"],
    envVars: {},
    tools: ["read_text_file", "write_file", "edit_file", "list_directory", "search_files", "directory_tree", "move_file"],
    docsUrl: "https://github.com/modelcontextprotocol/servers/tree/main/src/filesystem",
  },
  {
    id: "memory",
    name: "Memory",
    description: "Knowledge graph-based persistent memory. Store entities, observations, and relations across sessions.",
    category: "ai",
    package: "@modelcontextprotocol/server-memory",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-memory"],
    envVars: {},
    tools: ["create_entities", "create_relations", "add_observations", "read_graph", "search_nodes", "open_nodes"],
    docsUrl: "https://github.com/modelcontextprotocol/servers/tree/main/src/memory",
  },

  // ── Dev Tools ──────────────────────────────────────────────────────────────
  {
    id: "github",
    name: "GitHub",
    description: "GitHub's official MCP server — repos, issues, PRs, Actions, code security, and more.",
    category: "dev-tools",
    package: "ghcr.io/github/github-mcp-server",
    command: "docker",
    args: ["run", "-i", "--rm", "-e", "GITHUB_PERSONAL_ACCESS_TOKEN", "ghcr.io/github/github-mcp-server"],
    envVars: { GITHUB_PERSONAL_ACCESS_TOKEN: "ghp_xxxxxxxxxxxx" },
    tools: ["get_file_contents", "create_or_update_file", "create_issue", "create_pull_request", "search_code", "list_commits"],
    docsUrl: "https://github.com/github/github-mcp-server",
  },
  {
    id: "git",
    name: "Git",
    description: "Read, search, and manipulate local Git repositories — status, diff, commit, branch, and log.",
    category: "dev-tools",
    package: "mcp-server-git",
    command: "uvx",
    args: ["mcp-server-git", "--repository", "./"],
    envVars: {},
    tools: ["git_status", "git_diff_unstaged", "git_diff_staged", "git_commit", "git_add", "git_log", "git_create_branch"],
    docsUrl: "https://github.com/modelcontextprotocol/servers/tree/main/src/git",
  },
  {
    id: "docker",
    name: "Docker",
    description: "Complete Docker management — containers, images, networks, and volumes via Docker socket.",
    category: "dev-tools",
    package: "@thelord/mcp-server-docker-npx",
    command: "npx",
    args: ["-y", "@thelord/mcp-server-docker-npx"],
    envVars: {},
    tools: ["list_containers", "create_container", "start_container", "stop_container", "container_logs", "list_images", "pull_image"],
    docsUrl: "https://www.npmjs.com/package/@thelord/mcp-server-docker-npx",
  },
  {
    id: "sentry",
    name: "Sentry",
    description: "Connect to Sentry for error tracking — list projects, retrieve issues, analyze events, root cause analysis.",
    category: "dev-tools",
    package: "@sentry/mcp-server",
    command: "npx",
    args: ["-y", "@sentry/mcp-server"],
    envVars: {},
    tools: ["list_projects", "get_issue_details", "get_event", "search_errors"],
    docsUrl: "https://github.com/getsentry/sentry-mcp-stdio",
  },
  {
    id: "sequential-thinking",
    name: "Sequential Thinking",
    description: "Dynamic and reflective problem-solving through thought sequences. Helps break down complex problems.",
    category: "ai",
    package: "@modelcontextprotocol/server-sequential-thinking",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-sequential-thinking"],
    envVars: {},
    tools: ["sequentialthinking"],
    docsUrl: "https://github.com/modelcontextprotocol/servers/tree/main/src/sequentialthinking",
  },
  {
    id: "context7",
    name: "Context7",
    description: "Up-to-date, version-specific library documentation and code examples for AI coding assistants.",
    category: "ai",
    package: "@upstash/context7-mcp",
    command: "npx",
    args: ["-y", "@upstash/context7-mcp"],
    envVars: {},
    tools: ["resolve-library-id", "query-docs"],
    docsUrl: "https://github.com/upstash/context7",
  },

  // ── Browser ────────────────────────────────────────────────────────────────
  {
    id: "playwright",
    name: "Playwright",
    description: "Browser automation by Microsoft — navigate, click, type, screenshot, and extract data from web pages.",
    category: "browser",
    package: "@playwright/mcp",
    command: "npx",
    args: ["-y", "@playwright/mcp@latest"],
    envVars: {},
    tools: ["browser_navigate", "browser_click", "browser_type", "browser_snapshot", "browser_take_screenshot", "browser_evaluate"],
    docsUrl: "https://github.com/microsoft/playwright-mcp",
  },
  {
    id: "fetch",
    name: "Fetch",
    description: "Fetch web content and convert HTML to markdown for efficient LLM consumption.",
    category: "browser",
    package: "@modelcontextprotocol/server-fetch",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-fetch"],
    envVars: {},
    tools: ["fetch"],
    docsUrl: "https://github.com/modelcontextprotocol/servers/tree/main/src/fetch",
  },
  {
    id: "puppeteer",
    name: "Puppeteer",
    description: "Browser automation via Puppeteer — navigate, click, fill forms, screenshot, and execute JavaScript.",
    category: "browser",
    package: "@modelcontextprotocol/server-puppeteer",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-puppeteer"],
    envVars: {},
    tools: ["puppeteer_navigate", "puppeteer_screenshot", "puppeteer_click", "puppeteer_fill", "puppeteer_evaluate"],
    docsUrl: "https://github.com/modelcontextprotocol/servers/tree/main/src/puppeteer",
  },

  // ── Search ─────────────────────────────────────────────────────────────────
  {
    id: "brave-search",
    name: "Brave Search",
    description: "Web search, local search, image/video/news search via the Brave Search API.",
    category: "search",
    package: "@brave/brave-search-mcp-server",
    command: "npx",
    args: ["-y", "@brave/brave-search-mcp-server"],
    envVars: { BRAVE_API_KEY: "BSA_xxxxxxxxxxxx" },
    tools: ["brave_web_search", "brave_local_search", "brave_image_search", "brave_news_search"],
    docsUrl: "https://github.com/brave/brave-search-mcp-server",
  },
  {
    id: "exa",
    name: "Exa",
    description: "AI-powered web search, company research, code search, and URL content extraction.",
    category: "search",
    package: "exa-mcp-server",
    command: "npx",
    args: ["-y", "exa-mcp-server"],
    envVars: { EXA_API_KEY: "exa-xxxxxxxxxxxx" },
    tools: ["web_search_exa", "get_code_context_exa", "company_research", "crawling"],
    docsUrl: "https://github.com/exa-labs/exa-mcp-server",
  },

  // ── Database ───────────────────────────────────────────────────────────────
  {
    id: "postgres",
    name: "PostgreSQL",
    description: "Read-only access to PostgreSQL databases — schema inspection and safe query execution.",
    category: "database",
    package: "@modelcontextprotocol/server-postgres",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-postgres", "postgresql://localhost:5432/mydb"],
    envVars: {},
    tools: ["query"],
    docsUrl: "https://github.com/modelcontextprotocol/servers",
  },
  {
    id: "sqlite",
    name: "SQLite",
    description: "SQLite database management — query, create tables, inspect schemas, and full CRUD operations.",
    category: "database",
    package: "mcp-server-sqlite-npx",
    command: "npx",
    args: ["-y", "mcp-server-sqlite-npx", "./data.sqlite"],
    envVars: {},
    tools: ["sqlite_get_catalog", "sqlite_execute"],
    docsUrl: "https://github.com/johnnyoshika/mcp-server-sqlite-npx",
  },

  // ── Productivity ───────────────────────────────────────────────────────────
  {
    id: "notion",
    name: "Notion",
    description: "Official Notion MCP — search, create, and update pages, databases, and blocks in your workspace.",
    category: "productivity",
    package: "@notionhq/notion-mcp-server",
    command: "npx",
    args: ["-y", "@notionhq/notion-mcp-server"],
    envVars: { NOTION_API_KEY: "ntn_xxxxxxxxxxxx" },
    tools: ["notion_search", "notion_get_page", "notion_query_database", "notion_create_page", "notion_update_page"],
    docsUrl: "https://github.com/makenotion/notion-mcp-server",
  },
  {
    id: "linear",
    name: "Linear",
    description: "Interact with Linear project management — search, create, and update issues, projects, and teams.",
    category: "productivity",
    package: "mcp-remote",
    command: "npx",
    args: ["-y", "mcp-remote", "https://mcp.linear.app/mcp"],
    envVars: {},
    tools: ["search_issues", "create_issue", "update_issue", "get_teams", "get_my_issues"],
    docsUrl: "https://linear.app/docs/mcp",
  },

  // ── Communication ──────────────────────────────────────────────────────────
  {
    id: "slack",
    name: "Slack",
    description: "Interact with Slack workspaces — list channels, read/post messages, search, manage threads.",
    category: "communication",
    package: "@modelcontextprotocol/server-slack",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-slack"],
    envVars: { SLACK_BOT_TOKEN: "xoxb-xxxxxxxxxxxx", SLACK_TEAM_ID: "T00000000" },
    tools: ["list_channels", "post_message", "reply_to_thread", "get_channel_history", "search_messages"],
    docsUrl: "https://github.com/modelcontextprotocol/servers",
  },

  // ── Cloud ──────────────────────────────────────────────────────────────────
  {
    id: "cloudflare",
    name: "Cloudflare",
    description: "Access the entire Cloudflare API (2,500+ endpoints) — DNS, Workers, R2, Zero Trust, and more.",
    category: "cloud",
    package: "@cloudflare/mcp-server-cloudflare",
    command: "npx",
    args: ["-y", "@cloudflare/mcp-server-cloudflare"],
    envVars: {},
    tools: ["search", "execute"],
    docsUrl: "https://github.com/cloudflare/mcp-server-cloudflare",
  },

  // ── Payments ───────────────────────────────────────────────────────────────
  {
    id: "stripe",
    name: "Stripe",
    description: "Integrate with Stripe APIs — manage customers, products, payments, subscriptions, and invoices.",
    category: "cloud",
    package: "@stripe/mcp",
    command: "npx",
    args: ["-y", "@stripe/mcp", "--tools=all", "--api-key=YOUR_STRIPE_KEY"],
    envVars: {},
    tools: ["customers.create", "customers.read", "products.create", "invoices.create", "payment_intents.create"],
    docsUrl: "https://docs.stripe.com/mcp",
  },

  // ── Design ─────────────────────────────────────────────────────────────────
  {
    id: "figma",
    name: "Figma",
    description: "Access Figma design files — extract design tokens, components, layout data for code generation.",
    category: "design",
    package: "figma-developer-mcp",
    command: "npx",
    args: ["-y", "figma-developer-mcp", "--stdio"],
    envVars: { FIGMA_API_KEY: "figd_xxxxxxxxxxxx" },
    tools: ["get_file", "get_file_nodes", "get_image", "get_component", "get_styles"],
    docsUrl: "https://help.figma.com/hc/en-us/articles/32132100833559",
  },

  // ── Maps ───────────────────────────────────────────────────────────────────
  {
    id: "google-maps",
    name: "Google Maps",
    description: "Location services — geocoding, place search, directions, distance matrix, and elevation data.",
    category: "cloud",
    package: "@modelcontextprotocol/server-google-maps",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-google-maps"],
    envVars: { GOOGLE_MAPS_API_KEY: "AIza_xxxxxxxxxxxx" },
    tools: ["maps_geocode", "maps_search_places", "maps_directions", "maps_distance_matrix", "maps_elevation"],
    docsUrl: "https://github.com/modelcontextprotocol/servers",
  },
];

export default MCP_DIRECTORY;
