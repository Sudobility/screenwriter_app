import { expect, test, type Page } from "@playwright/test";
import { devUidForEmail } from "../../screenwriter_lib/src/auth/dev-auth";

// Line alternates: a few AI rewrites of the line under the caret; picking one replaces the line. Real stack, fixture AI.

const email = `e2e-alts-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
const API = `http://localhost:${Number(process.env.E2E_API_PORT ?? 18042)}`;
const authFor = (e: string) => ({ Authorization: `Bearer dev:${devUidForEmail(e)}:${e}` });
const synced = (page: Page) => expect(page.getByTestId("sync-status")).toHaveAttribute("data-state", "synced");

test("line alternates offers rewrites and replaces the line with the chosen one", async ({ page }) => {
  await page.goto("/en/login");
  await page.getByLabel("Dev login (email, no password)").fill(email);
  await page.getByLabel("Password", { exact: true }).fill("x");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByLabel("New project name").fill("Alternates project");
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
    s.execute([{ id: "element.insert", params: { style: "st_character", text: "TOMAS" } }], { kind: "local-command" });
    s.execute([{ id: "element.insert", params: { style: "st_dialogue", text: "It has outlasted better storms than you." } }], { kind: "local-command" });
  });
  await synced(page);
  await page.request.post(`${API}/api/v1/me/ai-consents`, { headers: authFor(email), data: { version: 1 } });

  // Caret on the dialogue line → that line is the target.
  await page.getByTestId("script-editor").getByText("It has outlasted better storms than you.").click();
  await page.getByTestId("ai-button").click();
  await page.getByTestId("ai-action-alternates").click();
  const section = page.getByTestId("ai-alternates-section");
  await expect(section).toBeVisible();
  await section.getByTestId("ai-alternates-button").click();

  const options = section.getByTestId("ai-alternates-option");
  await expect(options.first()).toBeVisible({ timeout: 30_000 });
  await expect(options).toHaveCount(3);
  await options.first().click();
  await expect(section.getByTestId("ai-alternates-msg")).toContainText("Line replaced");
  await expect(page.getByTestId("script-editor")).toContainText("(alt 1)");
});
