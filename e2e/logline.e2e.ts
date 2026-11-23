import { expect, test, type Page } from "@playwright/test";
import { devUidForEmail } from "../../screenwriter_lib/src/auth/dev-auth";

// The AI panel's "Logline & synopsis" section turns the whole script into pitch material. Real stack, fixture AI.

const email = `e2e-logline-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
const API = `http://localhost:${Number(process.env.E2E_API_PORT ?? 18042)}`;
const authFor = (e: string) => ({ Authorization: `Bearer dev:${devUidForEmail(e)}:${e}` });
const synced = (page: Page) => expect(page.getByTestId("sync-status")).toHaveAttribute("data-state", "synced");

test("AI writes a logline, synopsis and treatment from the script", async ({ page }) => {
  await page.goto("/en/login");
  await page.getByLabel("Dev login (email, no password)").fill(email);
  await page.getByLabel("Password", { exact: true }).fill("x");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByLabel("New project name").fill("Logline project");
  await page.getByRole("button", { name: "Create project" }).click();
  await expect(page.getByRole("heading", { name: "Documents" })).toBeVisible();
  await page.getByLabel("Title", { exact: true }).fill("A script");
  await page.getByRole("button", { name: "Create document" }).click();
  await expect(page).toHaveURL(/\/d\/(doc_[A-Za-z0-9]+)/);
  await expect(page.getByTestId("script-editor")).toBeVisible();
  await synced(page);
  await page.evaluate(() => {
    const s = (window as any).__fadewright.session;
    s.execute([{ id: "element.insert", params: { style: "st_scene_heading", text: "INT. LIGHTHOUSE - NIGHT" } }], { kind: "local-command" });
    s.execute([{ id: "element.insert", params: { style: "st_action", text: "Tomas winds the lamp as the storm hits." } }], { kind: "local-command" });
  });
  await synced(page);
  await page.request.post(`${API}/api/v1/me/ai-consents`, { headers: authFor(email), data: { version: 1 } });

  await page.getByTestId("ai-button").click();
  const section = page.getByTestId("ai-logline-section");
  await expect(section).toBeVisible();
  await section.getByTestId("ai-logline-button").click();

  const result = page.getByTestId("ai-logline-result");
  await expect(result).toBeVisible({ timeout: 30_000 });
  await expect(result).toContainText("fixture logline");
  await expect(result.getByTestId("ai-logline-treatment")).toBeVisible();
});

test("AI plots a tension curve across the scenes", async ({ page }) => {
  const e2 = `e2e-tension-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
  await page.goto("/en/login");
  await page.getByLabel("Dev login (email, no password)").fill(e2);
  await page.getByLabel("Password", { exact: true }).fill("x");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByLabel("New project name").fill("Tension project");
  await page.getByRole("button", { name: "Create project" }).click();
  await expect(page.getByRole("heading", { name: "Documents" })).toBeVisible();
  await page.getByLabel("Title", { exact: true }).fill("A script");
  await page.getByRole("button", { name: "Create document" }).click();
  await expect(page).toHaveURL(/\/d\/(doc_[A-Za-z0-9]+)/);
  await expect(page.getByTestId("script-editor")).toBeVisible();
  await synced(page);
  await page.evaluate(() => {
    const s = (window as any).__fadewright.session;
    for (const el of [...s.model.elements()]) s.execute([{ id: "text.deleteBackward", params: { at: { elementId: el.id, offset: 0 }, unit: "element" } }]);
    for (const [h, a] of [["INT. KITCHEN - DAY", "A calm breakfast."], ["EXT. ROOFTOP - DUSK", "An argument builds."], ["INT. VAULT - NIGHT", "The confrontation erupts."]]) {
      s.execute([{ id: "element.insert", params: { style: "st_scene_heading", text: h } }], { kind: "local-command" });
      s.execute([{ id: "element.insert", params: { style: "st_action", text: a } }], { kind: "local-command" });
    }
  });
  await synced(page);
  await page.request.post(`${API}/api/v1/me/ai-consents`, { headers: authFor(e2), data: { version: 1 } });

  await page.getByTestId("ai-button").click();
  const section = page.getByTestId("ai-tension-section");
  await expect(section).toBeVisible();
  await section.getByTestId("ai-tension-button").click();
  await expect(page.getByTestId("ai-tension-result")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("ai-tension-point")).toHaveCount(3);
  // The fixture scores scenes 1,2,3 → two are low-tension (≤2); clicking a point/sag jumps to its scene.
  await expect(page.getByTestId("ai-tension-sag").first()).toBeVisible();
});

test("AI breaks the script down into production elements by scene", async ({ page }) => {
  const e3 = `e2e-breakdown-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
  await page.goto("/en/login");
  await page.getByLabel("Dev login (email, no password)").fill(e3);
  await page.getByLabel("Password", { exact: true }).fill("x");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByLabel("New project name").fill("Breakdown project");
  await page.getByRole("button", { name: "Create project" }).click();
  await expect(page.getByRole("heading", { name: "Documents" })).toBeVisible();
  await page.getByLabel("Title", { exact: true }).fill("A script");
  await page.getByRole("button", { name: "Create document" }).click();
  await expect(page).toHaveURL(/\/d\/(doc_[A-Za-z0-9]+)/);
  await expect(page.getByTestId("script-editor")).toBeVisible();
  await synced(page);
  await page.evaluate(() => {
    const s = (window as any).__fadewright.session;
    for (const el of [...s.model.elements()]) s.execute([{ id: "text.deleteBackward", params: { at: { elementId: el.id, offset: 0 }, unit: "element" } }]);
    s.execute([{ id: "element.insert", params: { style: "st_scene_heading", text: "INT. KITCHEN - DAY" } }], { kind: "local-command" });
    s.execute([{ id: "element.insert", params: { style: "st_action", text: "Maya pours coffee into a mug." } }], { kind: "local-command" });
  });
  await synced(page);
  await page.request.post(`${API}/api/v1/me/ai-consents`, { headers: authFor(e3), data: { version: 1 } });

  await page.getByTestId("ai-button").click();
  const section = page.getByTestId("ai-breakdown-section");
  await expect(section).toBeVisible();
  await section.getByTestId("ai-breakdown-button").click();
  const result = page.getByTestId("ai-breakdown-result");
  await expect(result).toBeVisible({ timeout: 30_000 });
  await expect(result.getByTestId("ai-breakdown-scene").first()).toBeVisible();
  await expect(result.locator('[data-testid="ai-breakdown-category"][data-category="props"]').first()).toContainText("coffee mug");
});
