import { defineConfig } from "@playwright/test";

// Soak run against an already-started stack (see e2e/soak.e2e.ts). Ports are deliberately not 8036/5143.
const APP_PORT = Number(process.env.E2E_APP_PORT ?? 15373);

export default defineConfig({
  testDir: "e2e",
  testMatch: "**/soak.e2e.ts",
  timeout: 600_000,
  expect: { timeout: 15_000 },
  workers: 1,
  reporter: "list",
  use: { baseURL: `http://localhost:${APP_PORT}`, headless: true, viewport: { width: 1400, height: 900 } },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
});
