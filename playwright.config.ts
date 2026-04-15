import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/ui",
  fullyParallel: false,          // run sequentially — single-server state
  forbidOnly: !!process.env.CI,
  retries: 1,
  workers: 1,
  globalSetup: "./tests/ui/helpers/global-setup.ts",
  reporter: [["list"], ["html", { outputFolder: "playwright-report", open: "never" }]],
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    headless: true,
    // All tests use the pre-authenticated browser state
    storageState: "tests/ui/.auth-state.json",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
