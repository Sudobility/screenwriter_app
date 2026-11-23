import { expect, test, type Page } from "@playwright/test";
import { devUidForEmail } from "../../screenwriter_lib/src/auth/dev-auth";

// Revision intelligence: the AI panel's "What changed since…" compares a snapshot to the current script and
// reports a story-level summary. Real stack, fixture AI.

const email = `e2e-revision-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
const API = `http://localhost:${Number(process.env.E2E_API_PORT ?? 18042)}`;
const authFor = (e: string) => ({ Authorization: `Bearer dev:${devUidForEmail(e)}:${e}` });
const synced = (page: Page) => expect(page.getByTestId("sync-status")).toHaveAttribute("data-state", "synced");

test("AI summarizes what changed since a snapshot", async ({ page }) => {
  await page.goto("/en/login");
  await page.getByLabel("Dev login (email, no password)").fill(email);
  await page.getByLabel("Password", { exact: true }).fill("x");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByLabel("New project name").fill("Revision project");
  await page.getByRole("button", { name: "Create project" }).click();
  await expect(page.getByRole("heading", { name: "Documents" })).toBeVisible();
  await page.getByLabel("Title", { exact: true }).fill("A script");
  await page.getByRole("button", { name: "Create document" }).click();
  await expect(page).toHaveURL(/\/d\/(doc_[A-Za-z0-9]+)/);
  const did = /\/d\/(doc_[A-Za-z0-9]+)/.exec(page.url())![1]!;
  await expect(page.getByTestId("script-editor")).toBeVisible();
  await synced(page);
  await page.evaluate(() => {
    const s = (window as any).__fadewright.session;
    s.execute([{ id: "element.insert", params: { style: "st_scene_heading", text: "INT. LIGHTHOUSE - NIGHT" } }], { kind: "local-command" });
    s.execute([{ id: "element.insert", params: { style: "st_action", text: "Tomas waits by the lamp." } }], { kind: "local-command" });
  });
  await synced(page);

  // A snapshot to compare against, then an edit so there is something to summarize.
  const snap = await page.request.post(`${API}/api/v1/documents/${did}/snapshots`, { headers: authFor(email), data: { name: "Draft 1" } });
  expect(snap.ok(), `snapshot failed: ${snap.status()}`).toBe(true);
  await page.evaluate(() => {
    const s = (window as any).__fadewright.session;
    s.execute([{ id: "element.insert", params: { style: "st_action", text: "He lights the lamp; the ships are saved." } }], { kind: "local-command" });
  });
  await synced(page);
  await page.request.post(`${API}/api/v1/me/ai-consents`, { headers: authFor(email), data: { version: 1 } });

  await page.getByTestId("ai-button").click();
  const section = page.getByTestId("ai-revision-section");
  await expect(section).toBeVisible();
  await expect(section.getByTestId("ai-revision-snapshot")).toBeVisible();
  await section.getByTestId("ai-revision-button").click();

  const result = page.getByTestId("ai-revision-result");
  await expect(result).toBeVisible({ timeout: 30_000 });
  await expect(result.getByTestId("ai-revision-summary")).toContainText("fixture revision summary");
  await expect(result.getByTestId("ai-revision-change").first()).toBeVisible();
  await expect(result.getByTestId("ai-revision-arc").first()).toBeVisible();
});
