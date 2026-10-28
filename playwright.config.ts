import { defineConfig } from "@playwright/test";

// Real-browser companion checks (form login, primary actions, 320/390px).
// Locally, system Google Chrome is used when PLAYWRIGHT_CHANNEL=chrome;
// in CI, `npx playwright install --with-deps chromium` provides the browser.
export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  use: {
    baseURL: "http://127.0.0.1:3210",
    ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL as "chrome" } : {}),
  },
  webServer: {
    command: "npm run build && LAUNCHPAD_DEMO=1 NODE_ENV=development LAUNCHPAD_DB_PATH=:memory: LAUNCHPAD_BASE_URL=http://127.0.0.1:3210 PORT=3210 node dist/server.js",
    url: "http://127.0.0.1:3210/health",
    timeout: 120_000,
    reuseExistingServer: false,
  },
});
