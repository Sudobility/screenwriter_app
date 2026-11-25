import { expect, test, type Page } from "@playwright/test";

/**
 * Storyboards: generate a line-art storyboard for a scene from the AI panel, see it listed by its title in the
 * Storyboards section, open it (title + description + frames), and delete it. Image generation needs a real image
 * provider, so under the e2e fixtures (AI_FIXTURE=1) the text — title and description — is produced but no frames
 * are drawn; the storyboard is still stored and shown, which is what this exercises.
 */
const newEmail = () => `e2e-sb-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
const synced = (page: Page) => expect(page.getByTestId("sync-status")).toHaveAttribute("data-state", "synced");

async function login(page: Page) {
  await page.goto("/en/login");
  await page.getByLabel("Dev login (email, no password)").fill(newEmail());
  await page.getByLabel("Password", { exact: true }).fill("x");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Projects", level: 1 })).toBeVisible();
}
async function createDoc(page: Page, title: string) {
  await page.getByLabel("New project name").fill("Storyboard project");
  await page.getByRole("button", { name: "Create project" }).click();
  await expect(page.getByRole("heading", { name: "Documents" }).first()).toBeVisible();
  await page.getByLabel("Title", { exact: true }).fill(title);
  await page.getByRole("button", { name: "Create document" }).click();
  await expect(page).toHaveURL(/\/d\/doc_/);
  await expect(page.getByTestId("script-editor")).toBeVisible();
  await synced(page);
}
async function seedScene(page: Page) {
  await page.evaluate(() => {
    const s = (window as any).__fadewright.session;
    const starter = s.model.elements()[0].id as string;
    s.execute([{ id: "element.setStyle", params: { elements: [starter], style: "st_scene_heading" } }], { kind: "local-command" });
    const range = { anchor: { elementId: starter, offset: 0 }, head: { elementId: starter, offset: 0 } };
    s.execute([{ id: "text.replaceRange", params: { range, text: "INT. OFFICE - DAY" } }], { kind: "local-command" });
    for (const [style, text] of [
      ["st_action", "Charlotte sets a photograph on the desk."],
      ["st_character", "CHARLOTTE"],
      ["st_dialogue", "You think his wife is cheating on him."],
    ] as const) {
      s.execute([{ id: "element.insert", params: { style, text } }], { kind: "local-command" });
    }
  });
  await synced(page);
}

test("generate a storyboard for a scene, see it listed, open it, and delete it", async ({ page }) => {
  await login(page);
  await createDoc(page, "Boarded");
  await seedScene(page);

  // Put the caret in the scene, then generate its storyboard from the AI panel.
  await page.locator(".wui-el", { hasText: "Charlotte sets a photograph" }).click();
  await page.getByTestId("ai-button").click();
  await page.getByTestId("ai-action-storyboard").click();
  await page.getByTestId("ai-storyboard-instructions").fill("Wide establishing shot, then a close on the photograph.");
  await page.getByTestId("ai-storyboard-button").click();
  // First AI use asks for consent; accepting lets the queued call go ahead.
  await expect(page.getByTestId("ai-consent")).toBeVisible();
  await page.getByTestId("ai-consent-accept").click();
  await expect(page.getByTestId("ai-storyboard-done")).toBeVisible();

  // Close the AI panel and open the Storyboards section: the new storyboard is listed by its title.
  await page.getByTestId("ai-button").click();
  await page.getByTestId("rail-storyboards").click();
  const nav = page.getByTestId("storyboards-navigation");
  await expect(nav).not.toContainText("No storyboards yet");

  // Opening it (auto-selected, the first item) shows the title and description; no frames under fixtures.
  await expect(page.getByTestId("storyboard-detail")).toBeVisible();
  await expect(page.getByTestId("storyboard-title")).not.toBeEmpty();
  await expect(page.getByTestId("storyboard-description")).not.toBeEmpty();

  // Delete it: the section falls back to its empty state.
  await page.getByTestId("storyboard-delete").click();
  await expect(nav).toContainText("No storyboards yet");
  await synced(page);
});
