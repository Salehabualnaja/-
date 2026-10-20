import { defineConfig, devices } from "@playwright/test";

const PORT = 3200;

/**
 * End-to-end tests against a production build with a fresh embedded database.
 * Run `npm run build` first (CI does), then `npm run test:e2e`.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    viewport: { width: 1440, height: 900 },
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } }],
  webServer: {
    command: `node scripts/e2e-server.mjs ${PORT}`,
    url: `http://localhost:${PORT}/api/workspace`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
