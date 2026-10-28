import { expect, test, type Page } from "@playwright/test";

/**
 * The structured AI actions from the UI (fixture answers: the API runs with AI_TEST_MODE=1): skeleton from a
 * description, dialogue polish and script generation, and scene polish. Consent is asked for on first use.
 */
// A fresh user per test: AI consent is per user, and each test starts from "not yet asked".
const newEmail = () => `e2e-aiact-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
const synced = (page: Page) => expect(page.getByTestId("sync-status")).toHaveAttribute("data-state", "synced");

async function login(page: Page) {
  await page.goto("/en/login");
  await page.getByLabel("Dev login (email, no password)").fill(newEmail());
  await page.getByLabel("Password", { exact: true }).fill("x");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Projects", level: 1 })).toBeVisible();
}
async function createDoc(page: Page, title: string) {
  await page.getByLabel("New project name").fill("AI actions project");
  await page.getByRole("button", { name: "Create project" }).click();
  await expect(page.getByRole("heading", { name: "Documents" })).toBeVisible();
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
    s.execute([{ id: "element.setStyle", params: { elements: [starter], style: "st_dialogue" } }], { kind: "local-command" });
    s.execute([{ id: "element.insert", params: { before: starter, style: "st_scene_heading", text: "int. archive - night" } }], { kind: "local-command" });
    s.execute([{ id: "element.insert", params: { before: starter, style: "st_character", text: "quinn" } }], { kind: "local-command" });
    s.execute([{ id: "element.insert", params: { before: starter, style: "st_dialogue", text: "It's all still here." } }], { kind: "local-command" });
  });
  await expect(page.getByTestId("page-count")).toHaveAttribute("data-status", "ready", { timeout: 30_000 });
}
const bodyTexts = (page: Page) =>
  page.evaluate(() => ((window as any).__fadewright.session.model.elements() as any[]).map(e => e.text.plain as string));

test("character: generate a skeleton from a description, asks for consent once, keeps what the writer wrote", async ({ page }) => {
  await login(page);
  await createDoc(page, "Skeleton AI");
  await seedScene(page);
  await page.getByTestId("rail-character").click();
  await page.getByRole("button", { name: "Refresh" }).click();
  await page.locator('[data-testid="catalog-kind-group"][data-kind="character"]').getByText("QUINN", { exact: true }).click();

  // The writer fills one field by hand first.
  const physical = page.locator('[data-testid="skeleton-section"][data-section="physical"]');
  await physical.getByTestId("skeleton-add-field-race").click();
  await physical.getByTestId("skeleton-field-race").fill("Kept by hand");
  await physical.getByTestId("skeleton-field-race").press("Tab");

  await page.getByTestId("ai-skeleton-toggle").click();
  await page.getByTestId("ai-skeleton-text").fill("Quinn is a 61 year old archivist who trusts paper more than people.");
  await page.getByTestId("ai-skeleton-generate").click();

  // First use: the API needs the user's consent; asking happens in the UI, then the call goes ahead.
  await expect(page.getByTestId("ai-consent")).toBeVisible();
  await page.getByTestId("ai-consent-accept").click();
  await expect(page.getByTestId("ai-skeleton-result")).toContainText("Filled in");
  await expect(physical.getByTestId("skeleton-field-age")).toHaveValue("61");
  await expect(physical.getByTestId("skeleton-field-appearance")).toHaveValue(/Quinn is a 61 year old/);
  await expect(physical.getByTestId("skeleton-field-race")).toHaveValue("Kept by hand");

  // Generating again does not ask again, and never overwrites a filled field (age stays 61).
  await page.getByTestId("ai-skeleton-text").fill("Quinn is 30 years old.");
  await page.getByTestId("ai-skeleton-generate").click();
  await expect(page.getByTestId("ai-skeleton-result")).toContainText("Nothing new to fill in");
  await expect(page.getByTestId("ai-consent")).toHaveCount(0);
  await expect(physical.getByTestId("skeleton-field-age")).toHaveValue("61");
});

test("character: polish dialogue with the skeleton, review the diff, apply", async ({ page }) => {
  await login(page);
  await createDoc(page, "Dialogue AI");
  await seedScene(page);
  await page.getByTestId("rail-character").click();
  await page.getByRole("button", { name: "Refresh" }).click();
  await page.locator('[data-testid="catalog-kind-group"][data-kind="character"]').getByText("QUINN", { exact: true }).click();

  await expect(page.getByTestId("polish-dialogue-run")).toHaveText("Polish 1 line");
  await page.getByTestId("polish-dialogue-run").click();
  await page.getByTestId("ai-consent-accept").click();
  await expect(page.getByTestId("polish-proposal")).toHaveCount(1);
  await expect(page.getByTestId("polish-proposal").getByTestId("ai-diff-after")).toContainText("(polished)");
  // Nothing has changed yet.
  expect(await bodyTexts(page)).toContain("It's all still here.");

  await page.getByTestId("polish-apply").click();
  await expect(page.getByTestId("polish-note")).toContainText("Applied 1 line");
  expect(await bodyTexts(page)).toContain("It's all still here. (polished)");
});

test("script: generate from a story, preview, insert into an empty document", async ({ page }) => {
  await login(page);
  await createDoc(page, "Script AI");
  await page.getByRole("button", { name: "AI", exact: true }).click();

  await page.getByTestId("ai-story").fill("A lighthouse keeper finds a door in the rock and opens it.");
  await page.getByTestId("ai-story-title").fill("The Door");
  await page.getByTestId("ai-generate-script").click();
  await page.getByTestId("ai-consent-accept").click();

  await expect(page.getByTestId("ai-script-preview")).toContainText("INT. FIXTURE ROOM - DAY");
  await expect(page.getByTestId("ai-script-scene")).toHaveCount(1);
  expect(await bodyTexts(page)).toEqual([""]); // still the empty starter: nothing inserted before the writer says so

  await page.getByTestId("ai-script-insert").click();
  await expect(page.getByTestId("ai-generate-note")).toContainText("Inserted 4 elements");
  const texts = await bodyTexts(page);
  expect(texts[0]).toBe("INT. FIXTURE ROOM - DAY");
  expect(texts).toContain("This is a canned line.");
  expect(texts).toHaveLength(4); // the empty starter was reused, not left behind
});

test("scene: polish with the characters' skeletons, compare, replace", async ({ page }) => {
  await login(page);
  await createDoc(page, "Scene AI");
  await seedScene(page);
  await page.getByTestId("rail-character").click();
  await page.getByRole("button", { name: "Refresh" }).click();
  await expect(page.locator('[data-testid="catalog-kind-group"][data-kind="character"]').getByText("QUINN", { exact: true })).toBeVisible();

  await page.locator(".wui-el", { hasText: "It's all still here." }).click(); // puts the caret in the scene
  await page.getByRole("button", { name: "AI", exact: true }).click();
  await expect(page.getByTestId("ai-scene-characters")).toContainText("QUINN");
  await expect(page.getByTestId("ai-scene-characters")).toContainText("no skeleton yet");

  await page.getByTestId("ai-polish-scene-button").click();
  await page.getByTestId("ai-consent-accept").click();
  await expect(page.getByTestId("ai-scene-proposal")).toBeVisible();
  await expect(page.getByTestId("ai-scene-before")).toContainText("It's all still here.");
  await expect(page.getByTestId("ai-scene-after")).toContainText("It's all still here. (polished)");
  expect(await bodyTexts(page)).not.toContain("It's all still here. (polished)");

  await page.getByTestId("ai-scene-replace").click();
  await expect(page.getByTestId("ai-polish-scene-note")).toContainText("Scene replaced");
  const texts = await bodyTexts(page);
  expect(texts).toEqual(["int. archive - night", "quinn", "It's all still here. (polished)"]);
});
