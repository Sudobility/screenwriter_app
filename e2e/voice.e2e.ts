import { expect, test, type Page } from "@playwright/test";
import { devUidForEmail } from "../../screenwriter_lib/src/auth/dev-auth";

// Character voice profile: generated from the character's own lines, stored on the entity, shown in the sidebar.
// Real stack, fixture AI.

const email = `e2e-voice-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
const API = `http://localhost:${Number(process.env.E2E_API_PORT ?? 18042)}`;
const authFor = (e: string) => ({ Authorization: `Bearer dev:${devUidForEmail(e)}:${e}` });
const synced = (page: Page) => expect(page.getByTestId("sync-status")).toHaveAttribute("data-state", "synced");

test("a character's voice profile is generated from their lines and shown on the entity", async ({ page }) => {
  await page.goto("/en/login");
  await page.getByLabel("Dev login (email, no password)").fill(email);
  await page.getByLabel("Password", { exact: true }).fill("x");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByLabel("New project name").fill("Voice project");
  await page.getByRole("button", { name: "Create project" }).click();
  await expect(page.getByRole("heading", { name: "Documents" })).toBeVisible();
  await page.getByLabel("Title", { exact: true }).fill("A script");
  await page.getByRole("button", { name: "Create document" }).click();
  await expect(page).toHaveURL(/\/d\/(doc_[A-Za-z0-9]+)/);
  await expect(page.getByTestId("script-editor")).toBeVisible();
  await synced(page);
  await page.evaluate(() => {
    const s = (window as any).__fadewright.session;
    const starter = s.model.elements()[0].id as string;
    s.execute([{ id: "element.setStyle", params: { elements: [starter], style: "st_dialogue" } }], { kind: "local-command" });
    s.execute([{ id: "element.insert", params: { before: starter, style: "st_scene_heading", text: "int. archive - night" } }], { kind: "local-command" });
    s.execute([{ id: "element.insert", params: { before: starter, style: "st_character", text: "quinn" } }], { kind: "local-command" });
    s.execute([{ id: "element.insert", params: { before: starter, style: "st_dialogue", text: "It's all still here." } }], { kind: "local-command" });
    s.execute([{ id: "element.insert", params: { before: starter, style: "st_character", text: "quinn" } }], { kind: "local-command" });
    s.execute([{ id: "element.insert", params: { before: starter, style: "st_dialogue", text: "Nobody ever threw a thing away." } }], { kind: "local-command" });
  });
  await synced(page);
  await expect(page.getByTestId("page-count")).toHaveAttribute("data-status", "ready", { timeout: 30_000 });
  await page.request.post(`${API}/api/v1/me/ai-consents`, { headers: authFor(email), data: { version: 1 } });

  await expect(page.getByTestId("editor-sidebar")).toBeVisible();
  await page.getByTestId("rail-character").click();
  await page.getByRole("button", { name: "Refresh" }).click();
  const charGroup = page.locator('[data-testid="catalog-kind-group"][data-kind="character"]');
  await charGroup.getByText("QUINN", { exact: true }).click();
  await expect(page.getByTestId("entity-detail")).toBeVisible();

  const box = page.getByTestId("voice-profile-box");
  await expect(box).toBeVisible();
  await box.getByTestId("voice-profile-generate").click();
  await expect(box.getByTestId("voice-profile-view")).toBeVisible({ timeout: 30_000 });
  await expect(box.getByTestId("voice-profile-summary")).toContainText("fixture voice profile");
});
