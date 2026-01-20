import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  use: {
    baseURL: "http://localhost:5000",
    headless: true,
  },
  webServer: {
    command: "npm run dev",
    url: "http://localhost:5000/api/health",
    reuseExistingServer: true,
    timeout: 120_000,
    env: {
      PORT: "5000",
      NODE_ENV: "development",
    },
  },
});
