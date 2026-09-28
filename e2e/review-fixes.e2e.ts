import { expect, test, type Page } from "@playwright/test";

/**
 * What the writer does about a review: "Fix formatting" (no AI: stored case, empty lines, stray spaces, all at once)
 * and "Suggest fixes" under a review note (fixture answers: the API runs with AI_TEST_MODE=1), where each suggested
 * fix is previewed and applied with one click.
 */
const newEmail = () => `e2e-fix-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
const synced = (page: Page) => expect(page.getByTestId("sync-status")).toHaveAttribute("data-state", "synced");

async function login(page: Page) {
  await page.goto("/en/login");
  await page.getByLabel("Dev login (email, no password)").fill(newEmail());
  await page.getByLabel("Password", { exact: true }).fill("x");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Projects", level: 1 })).toBeVisible();
}
async function createDoc(page: Page, title: string) {
  await page.getByLabel("New project name").fill("Fixes project");
  await page.getByRole("button", { name: "Create project" }).click();
  await expect(page.getByRole("heading", { name: "Documents" }).first()).toBeVisible();
  await page.getByLabel("Title", { exact: true }).fill(title);
  await page.getByRole("button", { name: "Create document" }).click();
  await expect(page).toHaveURL(/\/d\/doc_/);
  await expect(page.getByTestId("script-editor")).toBeVisible();
  await synced(page);
}
/** A scene typed the way people type: lower-case heading and cues, an empty line, stray spaces. */
async function seedMessy(page: Page) {
  await page.evaluate(() => {
    const s = (window as any).__fadewright.session;
    const starter = s.model.elements()[0].id as string;
    s.execute([{ id: "element.setStyle", params: { elements: [starter], style: "st_dialogue" } }], { kind: "local-command" });
    const range = { anchor: { elementId: starter, offset: 0 }, head: { elementId: starter, offset: 0 } };
    s.execute([{ id: "text.replaceRange", params: { range, text: "He has been dead for eleven years." } }], { kind: "local-command" });
    for (const [style, text] of [
      ["st_scene_heading", "int. adam's office - day"],
      ["st_action", "  Charlotte puts a photograph on the desk. "],
      ["st_action", ""],
      ["st_character", "adam"],
      ["st_dialogue", "You think his wife is cheating on him."],
      ["st_character", "Charlotte"],
    ]) {
      s.execute([{ id: "element.insert", params: { before: starter, style, text } }], { kind: "local-command" });
    }
  });
  await expect(page.getByTestId("page-count")).toHaveAttribute("data-status", "ready", { timeout: 30_000 });
}
const bodyTexts = (page: Page) =>
  page.evaluate(() => ((window as any).__fadewright.session.model.elements() as any[]).map(e => e.text.plain as string));

test("Fix formatting: capitals, empty lines and stray spaces fixed with one click", async ({ page }) => {
  await login(page);
  await createDoc(page, "Messy");
  const fix = page.getByTestId("fix-formatting");
  await expect(fix).toBeDisabled(); // a new document has nothing to fix
  await seedMessy(page);

  // The editor shows capitals whatever was typed: this is why the writer could not see the problem.
  await expect(page.locator(".wui-el", { hasText: "adam's office" })).toHaveCSS("text-transform", "uppercase");
  await expect(fix).toHaveText("Fix formatting (5)");
  await fix.click();
  await expect(page.getByTestId("fix-formatting-done")).toHaveText("3 headings or cues put in capitals, 1 empty line removed, 1 line trimmed.");
  expect(await bodyTexts(page)).toEqual([
    "INT. ADAM'S OFFICE - DAY",
    "Charlotte puts a photograph on the desk.",
    "ADAM",
    "You think his wife is cheating on him.",
    "CHARLOTTE",
    "He has been dead for eleven years.",
  ]);
  await expect(fix).toBeDisabled();
  await expect(fix).toHaveText("Fix formatting");
  await synced(page);
});

test("Review notes: suggest fixes, preview them, accept one with a click", async ({ page }) => {
  await login(page);
  await createDoc(page, "Noted");
  await seedMessy(page);
  await synced(page);

  await page.getByTestId("ai-button").click();
  await page.getByTestId("ai-review-button").click();
  await page.getByTestId("ai-panel-consent-accept").click();
  await page.getByTestId("ai-review-button").click();
  await expect(page.getByTestId("ai-report")).toBeVisible();
  // The review read the script as the writer sees it: the heading is in capitals although it was typed in lower case.
  await expect(page.getByTestId("ai-scene-heading").first()).toHaveText("INT. ADAM'S OFFICE - DAY");

  const fixes = page.getByTestId("note-fixes").first();
  await fixes.getByTestId("note-suggest-fixes").click();
  const cards = fixes.getByTestId("note-fix");
  await expect(cards).toHaveCount(2);
  // Nothing has changed yet.
  expect(await bodyTexts(page)).toContain("You think his wife is cheating on him.");
  await expect(cards.nth(0).getByTestId("ai-diff-after")).toContainText("(fixed)");
  await expect(cards.nth(1).getByTestId("note-fix-edit").first()).toHaveAttribute("data-kind", "remove");
  await page.screenshot({ path: "../screenwriter_plans/.superpowers/sdd/frontend-note-fixes.png" });

  await cards.nth(0).getByTestId("note-fix-accept").click();
  await expect(fixes.getByTestId("note-fix-message")).toContainText("Applied");
  await expect(cards).toHaveCount(0); // the other fix was for the old text
  const texts = await bodyTexts(page);
  expect(texts.filter(t => t.endsWith("(fixed)"))).toHaveLength(1);
  // The rest of the script is as it was (and still as typed: accepting a fix does not reformat).
  expect(texts[0]).toBe("int. adam's office - day");
});

test("Polish suggestions: a checkbox only where there is a choice; decided ones are folded away", async ({ page }) => {
  await login(page);
  await createDoc(page, "Decided");
  await seedMessy(page);
  await synced(page);
  await page.locator(".wui-el", { hasText: "You think his wife" }).click();
  await page.getByTestId("ai-button").click();
  await page.getByTestId("ai-polish-button").click();
  await page.getByTestId("ai-panel-consent-accept").click();
  await page.getByTestId("ai-polish-button").click();

  const open = page.getByTestId("ai-open-suggestions");
  await expect(open.getByTestId("ai-suggestion")).not.toHaveCount(0);
  const boxes = page.getByTestId("ai-suggestions").getByRole("checkbox");
  const n = await boxes.count();
  // Every checkbox on screen is ticked and can be unticked and ticked again.
  for (let i = 0; i < n; i++) {
    await expect(boxes.nth(i)).toBeChecked();
    await expect(boxes.nth(i)).toBeEnabled();
  }
  await boxes.first().uncheck();
  await expect(page.getByTestId("ai-suggestions")).toContainText("Not selected");
  await boxes.first().check();

  await page.getByTestId("ai-accept-all").click();
  await expect(page.getByTestId("ai-all-decided")).toBeVisible();
  // Nothing left to choose: no checkbox anywhere, no unticked greyed-out boxes.
  await expect(page.getByTestId("ai-suggestions").getByRole("checkbox")).toHaveCount(0);
  await expect(page.getByTestId("ai-accept-selected")).toBeHidden();
  const decided = page.getByTestId("ai-decided");
  await expect(decided).toContainText(`Already decided (${n})`);
  await expect(decided.getByTestId("ai-suggestion").first()).toBeHidden(); // folded
  await decided.locator("summary").click();
  await expect(decided.getByTestId("ai-suggestion-state").first()).toHaveText("Accepted: already in your script");

  // Reopened later: a set with nothing left to decide is not brought back.
  await synced(page);
  await page.reload();
  await expect(page.getByTestId("script-editor")).toBeVisible();
  await page.getByTestId("ai-button").click();
  await expect(page.getByTestId("ai-polish-button")).toBeVisible();
  await expect(page.getByTestId("ai-suggestions")).toHaveCount(0);
});

test("Review scope: the current scene can be reviewed once the scenes before it have summaries", async ({ page }) => {
  await login(page);
  await createDoc(page, "Scopes");
  await page.evaluate(() => {
    const s = (window as any).__fadewright.session;
    const starter = s.model.elements()[0].id as string;
    s.execute([{ id: "element.setStyle", params: { elements: [starter], style: "st_action" } }], { kind: "local-command" });
    const range = { anchor: { elementId: starter, offset: 0 }, head: { elementId: starter, offset: 0 } };
    s.execute([{ id: "text.replaceRange", params: { range, text: "Rain on the roof." } }], { kind: "local-command" });
    for (const [style, text] of [
      ["st_scene_heading", "INT. OFFICE - DAY"],
      ["st_action", "Adam waits at his desk."],
      ["st_scene_heading", "EXT. STREET - NIGHT"],
      ["st_action", "Charlotte crosses the street."],
      ["st_scene_heading", "EXT. ROOF - LATER"],
    ]) {
      s.execute([{ id: "element.insert", params: { before: starter, style, text } }], { kind: "local-command" });
    }
  });
  await synced(page);
  await page.locator(".wui-el", { hasText: "Rain on the roof." }).click(); // the third scene
  await page.getByTestId("ai-button").click();

  // No summaries yet: the current scene is not offered, and the panel says what is missing and what to do.
  const note = page.getByTestId("ai-review-scope-note");
  await expect(note).toHaveAttribute("data-scene-allowed", "false");
  await expect(note).toContainText("cannot be reviewed on its own yet: 2 of the 2 scenes before it have no summary");
  await expect(note).toContainText("Review the complete script once");
  await page.getByTestId("ai-review-scope").click();
  await expect(page.getByRole("option", { name: "Current scene" })).toHaveAttribute("data-disabled", "");
  await page.getByRole("option", { name: "Complete script" }).click();

  await page.getByTestId("ai-review-button").click();
  await page.getByTestId("ai-panel-consent-accept").click();
  await page.getByTestId("ai-review-button").click();
  await expect(page.getByTestId("ai-report-scope")).toHaveText("Review of the complete script");

  // The complete review summarised every scene: the current scene can be chosen now.
  await expect(note).toHaveAttribute("data-scene-allowed", "true");
  await page.getByTestId("ai-review-scope").click();
  await page.getByRole("option", { name: "Current scene" }).click();
  await expect(note).toContainText("with the 2 scenes before it as summaries");
  const started = page.waitForRequest(r => r.url().endsWith("/ai/jobs") && r.method() === "POST");
  await expect(page.getByTestId("ai-review-button")).toHaveText("Review this scene");
  await page.getByTestId("ai-review-button").click();
  const sceneId = await page.evaluate(() => String((window as any).__fadewright.session.model.scenes()[2].id));
  expect((await started).postDataJSON()).toEqual({ task: "coverage", scope: { sceneIds: [sceneId], storySoFar: true } });
  await expect(page.getByTestId("ai-report-scope")).toHaveText("Review of one scene: EXT. ROOF - LATER");
  await expect(page.getByTestId("ai-report-scope")).toHaveAttribute("data-scope", "scene");

  // A new scene written before it has no summary: the current scene is no longer offered.
  await page.evaluate(() => {
    const s = (window as any).__fadewright.session;
    const third = s.model.scenes()[2].id;
    s.execute([{ id: "element.insert", params: { before: third, style: "st_scene_heading", text: "INT. CELLAR - NIGHT" } }], { kind: "local-command" });
  });
  await synced(page);
  await page.locator(".wui-el", { hasText: "Rain on the roof." }).click();
  await expect(note).toContainText("1 of the 3 scenes before it has no summary (first: scene 3, INT. CELLAR - NIGHT)");
  await expect(page.getByTestId("ai-review-button")).toBeDisabled();
});
