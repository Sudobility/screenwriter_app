import { expect, test, type Page } from "@playwright/test";
import { devUidForEmail } from "../../screenwriter_lib/src/auth/dev-auth";

// Trim for length: a job that proposes shorter versions of lines across the script, shown as accept/reject
// suggestions (the shared suggestion UI). Real stack, fixture AI.

const email = `e2e-trim-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
const synced = (page: Page) => expect(page.getByTestId("sync-status")).toHaveAttribute("data-state", "synced");

test("trim proposes shorter lines as accept/reject suggestions", async ({ page }) => {
  void devUidForEmail;
  await page.goto("/en/login");
  await page.getByLabel("Dev login (email, no password)").fill(email);
  await page.getByLabel("Password", { exact: true }).fill("x");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByLabel("New project name").fill("Trim project");
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
    s.execute([{ id: "element.insert", params: { style: "st_action", text: "Tomas slowly and very carefully winds the old brass mechanism of the great lamp." } }], { kind: "local-command" });
  });
  await synced(page);

  await page.getByTestId("ai-button").click();
  const section = page.getByTestId("ai-trim-section");
  await expect(section).toBeVisible();
  await section.getByTestId("ai-trim-button").click();
  // First AI use asks for consent (trim is a job, like a review).
  const consent = page.getByTestId("ai-panel-consent");
  await expect(consent).toBeVisible();
  await page.getByTestId("ai-panel-consent-accept").click();
  await expect(consent).toHaveCount(0);
  await section.getByTestId("ai-trim-button").click();

  // The shorter-line suggestions render in the shared suggestion UI.
  await expect(page.getByTestId("ai-suggestions")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("ai-suggestion").first()).toBeVisible();
});
