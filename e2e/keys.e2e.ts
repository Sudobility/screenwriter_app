import { expect, test } from "@playwright/test";

const SHOTS = "/Users/johnhuang/projects/screenwriter_plans/.superpowers/sdd";
const API = `http://localhost:${Number(process.env.E2E_API_PORT ?? 18042)}`;
const email = `e2e-keys-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;

test("API keys page: create, one-time reveal, MCP snippet, use the key, revoke", async ({ page }) => {
  page.on("pageerror", e => console.log("[pageerror]", e.message));

  await page.goto("/en/login");
  await page.getByLabel("Dev login (email, no password)").fill(email);
  await page.getByLabel("Password", { exact: true }).fill("x");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  // "API keys" is a section of the dashboard's master list (UserDashboardPage); the section is local state, not a URL.
  await page.getByText("API keys", { exact: true }).click();
  await expect(page.getByRole("heading", { name: "API keys", level: 2 })).toBeVisible();
  await expect(page.getByText("No keys yet.")).toBeVisible();
  // placeholder snippet before any key exists
  await expect(page.getByTestId("mcp-json")).toContainText('"FADEWRIGHT_API_KEY": "fwk_..."');

  // ---- create
  await page.getByLabel("Key name").fill("e2e assistant");
  await page.getByLabel("Key access").selectOption("read");
  await page.getByRole("button", { name: "Create key" }).click();

  const reveal = page.getByTestId("key-reveal");
  await expect(reveal).toBeVisible();
  await expect(reveal).toContainText("You won't be able to see this key again");
  const key = (await page.getByTestId("revealed-key").textContent())!.trim();
  expect(key).toMatch(/^fwk_[a-z0-9]{8}_[A-Za-z0-9_-]{43}$/);
  const prefix = /^fwk_([a-z0-9]{8})_/.exec(key)![1]!;

  // the MCP snippets embed the revealed key with the env names the MCP package reads
  const json = (await page.getByTestId("mcp-json").textContent())!;
  expect(json).toContain(key);
  const parsed = JSON.parse(json);
  expect(parsed.mcpServers.fadewright.command).toBe("bun");
  expect(parsed.mcpServers.fadewright.env.FADEWRIGHT_API_KEY).toBe(key);
  expect(parsed.mcpServers.fadewright.env.FADEWRIGHT_API_URL).toBe(API);
  await expect(page.getByTestId("mcp-cmd")).toContainText(`claude mcp add fadewright -e FADEWRIGHT_API_KEY=${key}`);
  await page.screenshot({ path: `${SHOTS}/frontend-f8-keys.png`, fullPage: true });

  // it stays until dismissed (a list refresh does not remove it)
  await expect(page.getByTestId("key-row")).toHaveCount(1);
  await expect(reveal).toBeVisible();

  // ---- use the key against the API
  const headers = { Authorization: `Bearer ${key}` };
  const me = await page.request.get(`${API}/api/v1/me`, { headers });
  expect(me.status()).toBe(200);

  // ---- dismiss: the secret leaves the DOM, the row shows the prefix only
  await page.getByTestId("dismiss-reveal").click();
  await expect(reveal).toHaveCount(0);
  await expect(page.getByTestId("mcp-json")).toContainText("fwk_...");
  expect(await page.content()).not.toContain(key);
  const row = page.getByTestId("key-row");
  await expect(row).toContainText("e2e assistant");
  await expect(page.getByTestId("key-prefix")).toHaveText(`fwk_${prefix}_...`);
  await expect(row).toContainText("Read only");
  await expect(page.getByTestId("key-status")).toHaveText("Active");

  // the list response never carries the secret
  const listRes = page.waitForResponse(r => r.url().endsWith("/api/v1/api-keys") && r.request().method() === "GET");
  await page.reload();
  const listBody = await (await listRes).text();
  expect(listBody).toContain(prefix);
  expect(listBody).not.toContain(key);
  expect(listBody).not.toContain(key.split("_")[2]!);
  await expect(page.getByTestId("key-row")).toHaveCount(1);
  expect(await page.content()).not.toContain(key);

  // ---- revoke through the UI (with confirm)
  // The confirm dialog is @sudobility/components' FormModal (Phase C) — no testid seam on its container or
  // action buttons, so this asserts by visible text/role instead.
  await page.getByRole("button", { name: "Revoke" }).click();
  await expect(page.getByText("Revoke this key?")).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();
  expect((await page.request.get(`${API}/api/v1/me`, { headers })).status()).toBe(200);
  await page.getByRole("button", { name: "Revoke" }).click();
  await page.getByRole("button", { name: "Revoke key" }).click();
  await expect(page.getByTestId("key-status")).toHaveText("Revoked");
  await expect(page.getByRole("button", { name: "Revoke" })).toHaveCount(0);
  expect((await page.request.get(`${API}/api/v1/me`, { headers })).status()).toBe(401);
});
