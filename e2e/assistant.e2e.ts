import { expect, test, type Page } from "@playwright/test";
import { devUidForEmail } from "../../screenwriter_lib/src/auth/dev-auth";

// The read-only document assistant answers questions about the script and cites scenes. Real stack, fixture AI.

const email = `e2e-assistant-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
const API = `http://localhost:${Number(process.env.E2E_API_PORT ?? 18042)}`;
const authFor = (e: string) => ({ Authorization: `Bearer dev:${devUidForEmail(e)}:${e}` });
const synced = (page: Page) => expect(page.getByTestId("sync-status")).toHaveAttribute("data-state", "synced");

test("the assistant answers a question about the script and cites a scene", async ({ page }) => {
  await page.goto("/en/login");
  await page.getByLabel("Dev login (email, no password)").fill(email);
  await page.getByLabel("Password", { exact: true }).fill("x");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByLabel("New project name").fill("Assistant project");
  await page.getByRole("button", { name: "Create project" }).click();
  await expect(page.getByRole("heading", { name: "Documents" })).toBeVisible();
  await page.getByLabel("Title", { exact: true }).fill("A script");
  await page.getByRole("button", { name: "Create document" }).click();
  await expect(page).toHaveURL(/\/d\/(doc_[A-Za-z0-9]+)/);
  await expect(page.getByTestId("script-editor")).toBeVisible();
  await synced(page);
  await page.evaluate(() => {
    const s = (window as any).__fadewright.session;
    s.execute([{ id: "element.insert", params: { style: "st_scene_heading", text: "INT. LIGHTHOUSE - DAY" } }], { kind: "local-command" });
    s.execute([{ id: "element.insert", params: { style: "st_action", text: "Tomas cleans the lamp." } }], { kind: "local-command" });
  });
  await synced(page);
  await page.request.post(`${API}/api/v1/me/ai-consents`, { headers: authFor(email), data: { version: 1 } });

  await page.getByTestId("ai-button").click();
  await page.getByTestId("ai-action-assistant").click();
  const section = page.getByTestId("ai-assistant-section");
  await expect(section).toBeVisible();
  await section.getByTestId("ai-assistant-input").fill("Who cleans the lamp?");
  await section.getByTestId("ai-assistant-send").click();

  const messages = page.getByTestId("ai-assistant-messages");
  await expect(messages.locator('[data-testid="ai-assistant-message"][data-role="user"]')).toContainText("Who cleans the lamp?");
  await expect(messages.locator('[data-testid="ai-assistant-message"][data-role="assistant"]')).toContainText("fixture answer", { timeout: 30_000 });
  await expect(messages.getByTestId("ai-assistant-ref").first()).toBeVisible();
});
