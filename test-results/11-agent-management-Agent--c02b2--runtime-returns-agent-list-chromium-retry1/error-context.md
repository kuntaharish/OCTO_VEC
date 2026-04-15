# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: 11-agent-management.spec.ts >> Agent Management - API >> GET /api/agents/runtime returns agent list
- Location: tests/ui/11-agent-management.spec.ts:25:3

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: true
Received: false
```

# Page snapshot

```yaml
- generic [ref=e3]:
  - navigation [ref=e4]:
    - generic [ref=e5]:
      - generic [ref=e6]: O
      - generic [ref=e7]: OCTO-VEC
      - button "Collapse sidebar" [ref=e8] [cursor=pointer]:
        - img [ref=e10]
        - img [ref=e14]
    - generic [ref=e17]:
      - button "Overview" [ref=e18] [cursor=pointer]:
        - img [ref=e20]
        - generic [ref=e25]: Overview
      - button "Kanban" [ref=e26] [cursor=pointer]:
        - img [ref=e28]
        - generic [ref=e30]: Kanban
      - button "Live" [ref=e31] [cursor=pointer]:
        - img [ref=e33]
        - generic [ref=e35]: Live
      - button "Events" [ref=e36] [cursor=pointer]:
        - img [ref=e38]
        - generic [ref=e40]: Events
      - button "Snoop" [ref=e41] [cursor=pointer]:
        - img [ref=e43]
        - generic [ref=e46]: Snoop
      - button "Directory" [ref=e47] [cursor=pointer]:
        - img [ref=e49]
        - generic [ref=e54]: Directory
      - button "Chat" [ref=e55] [cursor=pointer]:
        - img [ref=e57]
        - generic [ref=e59]: Chat
      - button "Finance" [ref=e60] [cursor=pointer]:
        - img [ref=e62]
        - generic [ref=e65]: Finance
      - button "Reminders" [ref=e66] [cursor=pointer]:
        - img [ref=e68]
        - generic [ref=e71]: Reminders
      - button "Workspace" [ref=e72] [cursor=pointer]:
        - img [ref=e74]
        - generic [ref=e76]: Workspace
      - button "Settings" [ref=e77] [cursor=pointer]:
        - img [ref=e79]
        - generic [ref=e82]: Settings
    - button "Theme" [ref=e84] [cursor=pointer]:
      - img [ref=e86]
      - generic [ref=e92]: Theme
  - main [ref=e93]:
    - generic [ref=e94]:
      - generic [ref=e95]:
        - generic [ref=e96]:
          - heading "Kanban" [level=1] [ref=e97]
          - generic [ref=e98]: 0 tasks
        - button "All agents" [ref=e101] [cursor=pointer]:
          - generic [ref=e102]: All agents
          - img [ref=e103]
      - generic [ref=e105]:
        - generic [ref=e106]:
          - generic [ref=e107]:
            - generic [ref=e109]: Todo
            - generic [ref=e110]: "0"
          - generic [ref=e112]: No tasks
        - generic [ref=e113]:
          - generic [ref=e114]:
            - generic [ref=e116]: In Progress
            - generic [ref=e117]: "0"
          - generic [ref=e119]: No tasks
        - generic [ref=e120]:
          - generic [ref=e121]:
            - generic [ref=e123]: Done
            - generic [ref=e124]: "0"
          - generic [ref=e126]: No tasks
        - generic [ref=e127]:
          - generic [ref=e128]:
            - generic [ref=e130]: Failed
            - generic [ref=e131]: "0"
          - generic [ref=e133]: No tasks
        - generic [ref=e134]:
          - generic [ref=e135]:
            - generic [ref=e137]: Cancelled
            - generic [ref=e138]: "0"
          - generic [ref=e140]: No tasks
```

# Test source

```ts
  1   | /**
  2   |  * Agent Management Tests
  3   |  *
  4   |  * Covers:
  5   |  * - GET /api/agents/runtime returns running agents
  6   |  * - GET /api/role-templates returns role templates
  7   |  * - PATCH /api/agents/:agentId updates agent
  8   |  * - POST /api/agents/:agentId/pause pauses agent
  9   |  * - POST /api/agents/:agentId/resume resumes agent
  10  |  * - POST /api/agents/:agentId/toggle toggles active state
  11  |  * - POST /api/interrupt sends interrupt to agent
  12  |  * - DELETE /api/interrupt/:agentId clears interrupt
  13  |  * - POST /api/steer sends steering input to agent
  14  |  * - GET /api/todos returns todos
  15  |  * - GET /api/todos/:agentId returns agent todos
  16  |  */
  17  | import { test, expect } from "@playwright/test";
  18  | // storageState from global-setup provides auth for all page-based tests
  19  | 
  20  | const BASE = "http://localhost:3000";
  21  | 
  22  | test.describe("Agent Management - API", () => {
  23  |   test.beforeEach(async ({ page }) => { await page.goto("/"); });
  24  | 
  25  |   test("GET /api/agents/runtime returns agent list", async ({ page }) => {
  26  |     const resp = await page.request.get(`${BASE}/api/agents/runtime`);
  27  |     expect(resp.ok()).toBe(true);
  28  |     const agents = await resp.json();
> 29  |     expect(Array.isArray(agents)).toBe(true);
      |                                   ^ Error: expect(received).toBe(expected) // Object.is equality
  30  |   });
  31  | 
  32  |   test("GET /api/role-templates returns templates", async ({ page }) => {
  33  |     const resp = await page.request.get(`${BASE}/api/role-templates`);
  34  |     expect(resp.ok()).toBe(true);
  35  |     const templates = await resp.json();
  36  |     expect(Array.isArray(templates)).toBe(true);
  37  |     expect(templates.length).toBeGreaterThan(0);
  38  |   });
  39  | 
  40  |   test("GET /api/todos returns all agent todos", async ({ page }) => {
  41  |     const resp = await page.request.get(`${BASE}/api/todos`);
  42  |     expect(resp.ok()).toBe(true);
  43  |     const todos = await resp.json();
  44  |     expect(typeof todos === "object" && todos !== null).toBe(true);
  45  |   });
  46  | 
  47  |   test("GET /api/todos/pm returns PM todos", async ({ page }) => {
  48  |     const resp = await page.request.get(`${BASE}/api/todos/pm`);
  49  |     expect(resp.ok()).toBe(true);
  50  |     const todos = await resp.json();
  51  |     expect(Array.isArray(todos)).toBe(true);
  52  |   });
  53  | 
  54  |   test("GET /api/inbox/pm returns PM inbox", async ({ page }) => {
  55  |     const resp = await page.request.get(`${BASE}/api/inbox/pm`);
  56  |     expect(resp.ok()).toBe(true);
  57  |     const inbox = await resp.json();
  58  |     expect(Array.isArray(inbox)).toBe(true);
  59  |   });
  60  | 
  61  |   test("POST /api/agents/:agentId/pause returns ok for pm", async ({ page }) => {
  62  |     const resp = await page.request.post(`${BASE}/api/agents/pm/pause`);
  63  |     // Should succeed or return 404 if agent not pauseable
  64  |     expect([200, 404, 400].includes(resp.status())).toBe(true);
  65  |     // If succeeded, resume it
  66  |     if (resp.ok()) {
  67  |       await page.request.post(`${BASE}/api/agents/pm/resume`);
  68  |     }
  69  |   });
  70  | 
  71  |   test("POST /api/agents/:agentId/toggle toggles agent state", async ({ page }) => {
  72  |     const resp = await page.request.post(`${BASE}/api/agents/ba/toggle`);
  73  |     // Should return ok or an error if agent can't be toggled
  74  |     expect([200, 400, 404].includes(resp.status())).toBe(true);
  75  |     // Toggle back
  76  |     if (resp.ok()) {
  77  |       await page.request.post(`${BASE}/api/agents/ba/toggle`);
  78  |     }
  79  |   });
  80  | 
  81  |   test("POST /api/interrupt sends interrupt to pm agent", async ({ page }) => {
  82  |     const resp = await page.request.post(`${BASE}/api/interrupt`, {
  83  |       data: { agentId: "pm", message: "UI test interrupt" },
  84  |       headers: { "Content-Type": "application/json" },
  85  |     });
  86  |     expect([200, 400, 404].includes(resp.status())).toBe(true);
  87  |     // Clear the interrupt
  88  |     await page.request.delete(`${BASE}/api/interrupt/pm`);
  89  |   });
  90  | 
  91  |   test("DELETE /api/interrupt/:agentId clears interrupt", async ({ page }) => {
  92  |     const resp = await page.request.delete(`${BASE}/api/interrupt/pm`);
  93  |     expect([200, 404].includes(resp.status())).toBe(true);
  94  |   });
  95  | 
  96  |   test("POST /api/steer sends steering message", async ({ page }) => {
  97  |     const resp = await page.request.post(`${BASE}/api/steer`, {
  98  |       data: { agentId: "pm", message: "UI test steer message" },
  99  |       headers: { "Content-Type": "application/json" },
  100 |     });
  101 |     expect([200, 400, 404].includes(resp.status())).toBe(true);
  102 |   });
  103 | 
  104 |   test("GET /api/approvals returns array", async ({ page }) => {
  105 |     const resp = await page.request.get(`${BASE}/api/approvals`);
  106 |     expect(resp.ok()).toBe(true);
  107 |     const approvals = await resp.json();
  108 |     expect(Array.isArray(approvals)).toBe(true);
  109 |   });
  110 | 
  111 |   test("PATCH /api/agents/:agentId updates agent name", async ({ page }) => {
  112 |     // Get current agent data first
  113 |     const employees = await (await page.request.get(`${BASE}/api/employees`)).json();
  114 |     const ba = employees.find((e: { agent_key: string }) => e.agent_key === "ba");
  115 |     if (!ba) return;
  116 | 
  117 |     const resp = await page.request.patch(`${BASE}/api/agents/ba`, {
  118 |       data: { name: ba.name }, // no-op update (same name)
  119 |       headers: { "Content-Type": "application/json" },
  120 |     });
  121 |     expect([200, 400, 404].includes(resp.status())).toBe(true);
  122 |   });
  123 | });
  124 | 
```