import { defineConfig, devices } from "@playwright/test";

const PORT = process.env.PORT ? Number(process.env.PORT) : 5000;
const baseURL = process.env.PLAYWRIGHT_BASE_URL || `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./playwright",
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  webServer: {
    command: "npm run dev",
    url: baseURL,
    reuseExistingServer: true,
    timeout: 120_000,
    env: {
      NODE_ENV: "development",
      ENGINE_ENABLED: "false",
      AUTO_MARKET_BOOTSTRAP: "false",
      TELEGRAM_NOTIFICATIONS_ENABLED: "false",
      ALLOW_DEMO_ENDPOINTS: "true",
      SESSION_SECRET: "playwright-secret",
      REPL_ID: "playwright-repl",
    },
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
