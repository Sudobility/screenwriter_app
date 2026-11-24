import { expect, test, type Page } from "@playwright/test";
import { devUidForEmail } from "../../screenwriter_lib/src/auth/dev-auth";

// Tonal pass: rewrite the current scene toward a tone, preview per-element edits, apply through the note-fix path.
// Real stack, fixture AI.

const email = `e2e-tone-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
const API = `http://localhost:${Number(process.env.E2E_API_PORT ?? 18042)}`;
const authFor = (e: string) => ({ Authorization: `Bearer dev:${devUidForEmail(e)}:${e}` });
const synced = (page: Page) => expect(page.getByTestId("sync-status")).toHaveAttribute("data-state", "synced");

test("tonal pass previews and applies a scene rewrite", async ({ page }) => {
  await page.goto("/en/login");
  await page.getByLabel("Dev login (email, no password)").fill(email);
  await page.getByLabel("Password", { exact: true }).fill("x");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByLabel("New project name").fill("Tone project");
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
    s.execute([{ id: "element.insert", params: { style: "st_action", text: "Tomas cleans the lamp. A pleasant morning." } }], { kind: "local-command" });
    s.execute([{ id: "element.insert", params: { style: "st_character", text: "TOMAS" } }], { kind: "local-command" });
    s.execute([{ id: "element.insert", params: { style: "st_dialogue", text: "Lovely weather for it." } }], { kind: "local-command" });
  });
  await synced(page);
  await page.request.post(`${API}/api/v1/me/ai-consents`, { headers: authFor(email), data: { version: 1 } });

  // Put the caret in the scene so the tonal pass has a current scene.
  await page.getByTestId("script-editor").getByText("Lovely weather for it.").click();
  await page.getByTestId("ai-button").click();
  await page.getByTestId("ai-action-tone").click();
  const section = page.getByTestId("ai-tone-section");
  await expect(section).toBeVisible();
  await section.getByTestId("ai-tone-select").selectOption("darker");
  await section.getByTestId("ai-tone-button").click();

  await expect(section.getByTestId("ai-tone-result")).toBeVisible({ timeout: 30_000 });
  await expect(section.getByTestId("ai-tone-edit").first()).toBeVisible();
  await section.getByTestId("ai-tone-apply").click();
  await expect(section.getByTestId("ai-tone-applied")).toContainText("Applied");
  await expect(page.getByTestId("script-editor")).toContainText("(retoned)");
});
