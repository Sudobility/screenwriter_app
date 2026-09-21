import { defineConfig } from "@playwright/test";

// Real stack, no mocks: screenwriter_api (AI_TEST_MODE=1, screenwriter_test DB) + this app's Vite dev server.
// Ports are fixed but uncommon and overridable, because Playwright evaluates this file in every worker.
const API_PORT = Number(process.env.E2E_API_PORT ?? 18042);
const APP_PORT = Number(process.env.E2E_APP_PORT ?? 15173);
const API = `http://localhost:${API_PORT}`;
const APP = `http://localhost:${APP_PORT}`;

export default defineConfig({
  testDir: "e2e",
  testMatch: "**/*.e2e.ts",
  timeout: 180_000,
  expect: { timeout: 15_000 },
  workers: 1,
  reporter: "list",
  use: { baseURL: APP, headless: true, viewport: { width: 1400, height: 900 } },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
  webServer: [
    {
      // db:init is idempotent; the API also creates its tables at boot.
      command: "bun run db:init && bun run src/index.ts",
      cwd: "../screenwriter_api",
      url: `${API}/api/v1/health`,
      reuseExistingServer: false,
      timeout: 60_000,
      env: {
        PORT: String(API_PORT),
        DATABASE_URL: "postgres://localhost:5432/screenwriter_test",
        PUBLIC_APP_URL: APP,
        CORS_ORIGINS: APP,
        AI_TEST_MODE: "1",
      },
    },
    {
      command: `bunx vite --port ${APP_PORT} --strictPort`,
      url: APP,
      reuseExistingServer: false,
      timeout: 60_000,
      env: { VITE_API_URL: API, VITE_DEV_AUTH: "1" },
    },
  ],
});
