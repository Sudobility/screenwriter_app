import { expect, test, type Page } from "@playwright/test";

/**
 * Smart Paste in the AI panel (fixture answers: the API runs with AI_TEST_MODE=1): the text comes from the real
 * clipboard, the result is previewed, and nothing is written before "Apply". Covers the four kinds (characters,
 * plots, script, story), styled clipboard text, and the paste box used when the clipboard cannot be read.
 */
// A fresh user per test: AI consent is per user, and each test starts from "not yet asked".
const newEmail = () => `e2e-paste-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
const synced = (page: Page) => expect(page.getByTestId("sync-status")).toHaveAttribute("data-state", "synced");

async function login(page: Page) {
  await page.goto("/en/login");
  await page.getByLabel("Dev login (email, no password)").fill(newEmail());
  await page.getByLabel("Password", { exact: true }).fill("x");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Projects", level: 1 })).toBeVisible();
}
async function createDoc(page: Page, title: string) {
  await page.getByLabel("New project name").fill("Smart paste project");
  await page.getByRole("button", { name: "Create project" }).click();
  await expect(page.getByRole("heading", { name: "Documents" }).first()).toBeVisible();
  await page.getByLabel("Title", { exact: true }).fill(title);
  await page.getByRole("button", { name: "Create document" }).click();
  await expect(page).toHaveURL(/\/d\/doc_/);
  await expect(page.getByTestId("script-editor")).toBeVisible();
  await synced(page);
}
/** Two scenes; QUINN speaks in the first. */
async function seedScenes(page: Page) {
  await page.evaluate(() => {
    const s = (window as any).__fadewright.session;
    const starter = s.model.elements()[0].id as string;
    s.execute([{ id: "element.setStyle", params: { elements: [starter], style: "st_action" } }], { kind: "local-command" });
    const range = { anchor: { elementId: starter, offset: 0 }, head: { elementId: starter, offset: 0 } };
    s.execute([{ id: "text.replaceRange", params: { range, text: "Wind on the roof." } }], { kind: "local-command" });
    for (const [style, text] of [
      ["st_scene_heading", "INT. ARCHIVE - NIGHT"],
      ["st_character", "QUINN"],
      ["st_dialogue", "It's all still here."],
      ["st_scene_heading", "EXT. ROOF - DAY"],
    ]) {
      s.execute([{ id: "element.insert", params: { before: starter, style, text } }], { kind: "local-command" });
    }
  });
  await expect(page.getByTestId("page-count")).toHaveAttribute("data-status", "ready", { timeout: 30_000 });
}
const bodyTexts = (page: Page) =>
  page.evaluate(() => ((window as any).__fadewright.session.model.elements() as any[]).map(e => e.text.plain as string));
const entities = (page: Page, kind: string) =>
  page.evaluate(k => ((window as any).__fadewright.session.model.entities({ kind: k }) as any[]).map(e => ({ name: e.name, aliases: e.aliases, attributes: e.attributes })), kind);

const copy = (page: Page, text: string) => page.evaluate(t => navigator.clipboard.writeText(t), text);
const copyHtml = (page: Page, html: string, plain: string) =>
  page.evaluate(
    ([h, p]) =>
      navigator.clipboard.write([new ClipboardItem({ "text/html": new Blob([h!], { type: "text/html" }), "text/plain": new Blob([p!], { type: "text/plain" }) })]),
    [html, plain]
  );
async function choose(page: Page, kind: "Characters" | "Script" | "Story" | "Plots") {
  await page.getByTestId("smart-paste-select").click();
  await page.getByRole("option", { name: kind, exact: true }).click();
}

test.describe("with clipboard access", () => {
  test.use({ permissions: ["clipboard-read", "clipboard-write"] });

  test("characters: a new one is created, an existing one only has its blanks filled, the Catalog updates", async ({ page }) => {
    await login(page);
    await createDoc(page, "Paste characters");
    await seedScenes(page);
    await page.getByTestId("rail-character").click();
    await page.getByRole("button", { name: "Refresh" }).click();
    const group = page.locator('[data-testid="catalog-kind-group"][data-kind="character"]');
    await group.getByText("QUINN", { exact: true }).click();

    // The writer fills the age by hand first: a paste must not overwrite it.
    const physical = page.locator('[data-testid="skeleton-section"][data-section="physical"]');
    await physical.getByTestId("skeleton-field-age").fill("60");
    await physical.getByTestId("skeleton-field-age").press("Tab");

    await page.getByRole("button", { name: "AI", exact: true }).click();
    await copy(page, "Quinn, 61, an archivist who trusts paper more than people\nMara Lind, 34, a night nurse aka Mouse\nMara Lind at 9: afraid of the dark");
    await choose(page, "Characters");
    await expect(page.getByTestId("smart-paste-words")).toContainText("26 words, plain text");
    await expect(page.getByTestId("smart-paste-excerpt")).toContainText("Quinn, 61, an archivist");

    await page.getByTestId("smart-paste-run").click();
    await expect(page.getByTestId("ai-consent")).toBeVisible(); // first use: consent, then the call goes ahead
    await page.getByTestId("ai-consent-accept").click();

    const rows = page.getByTestId("smart-paste-character");
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(0)).toHaveAttribute("data-status", "update");
    await expect(rows.nth(0)).toContainText("QUINN");
    await expect(rows.nth(0)).toContainText("Age 60: fills Appearance");
    await expect(rows.nth(1)).toHaveAttribute("data-status", "new");
    await expect(rows.nth(1)).toContainText("Also known as: Mouse");
    await expect(rows.nth(1).getByTestId("smart-paste-stage")).toHaveCount(2);
    // Nothing is written before Apply.
    expect((await entities(page, "character")).map(e => e.name)).toEqual(["QUINN"]);

    await page.getByTestId("smart-paste-apply").click();
    await expect(page.getByTestId("smart-paste-note")).toContainText("1 character added (Mara Lind); 1 updated (QUINN)");

    // The UI refreshed: the new character is in the Catalog, as a branch with its two ages.
    await expect(group.getByText("Mara Lind", { exact: true })).toBeVisible();
    const all = await entities(page, "character");
    const quinn = all.find(e => e.name === "QUINN")!;
    expect(quinn.attributes["character.skeleton"]).toEqual({ age: "60", appearance: "an archivist who trusts paper more than people" });
    const mara = all.find(e => e.name === "Mara Lind")!;
    expect(mara.aliases).toEqual(["Mouse"]);
    expect((mara.attributes["character.stages"] as any[]).map(s => s.skeleton.age)).toEqual(["34", "9"]);

    // The open character view refreshed too: the field the paste filled is on screen, the writer's age is kept.
    await expect(physical.getByTestId("skeleton-field-age")).toHaveValue("60");
    await expect(physical.getByTestId("skeleton-field-appearance")).toHaveValue("an archivist who trusts paper more than people");

    await page.screenshot({ path: "../screenwriter_plans/.superpowers/sdd/frontend-smart-paste-characters.png" });
  });

  test("plots: main plot and subplots go into the Story items; a plot already written is kept", async ({ page }) => {
    await login(page);
    await createDoc(page, "Paste plots");
    await page.getByRole("button", { name: "AI", exact: true }).click();

    await copy(page, "Plot: A keeper finds a door in the rock.\n\nSubplot The debt: Ilse owes her brother-in-law.\n\nSubplot The priest: He writes to the ministry.");
    await choose(page, "Plots");
    await page.getByTestId("smart-paste-run").click();
    await page.getByTestId("ai-consent-accept").click();
    await expect(page.getByTestId("smart-paste-plot")).toHaveCount(3);
    await expect(page.getByTestId("smart-paste-plot").nth(0)).toHaveAttribute("data-status", "fill");
    await page.getByTestId("smart-paste-apply").click();
    await expect(page.getByTestId("smart-paste-note")).toContainText("3 plots written");

    const story = (await entities(page, "misc"))[0]!;
    expect(story.attributes["story.plotMain"]).toBe("A keeper finds a door in the rock.");
    expect((story.attributes["story.subplots"] as any[]).map(s => s.name)).toEqual(["The debt", "The priest"]);
    // The Catalog's Story group shows the new subplots without a reload.
    await page.getByTestId("rail-story").click();
    const storyGroup = page.getByTestId("catalog-story-group");
    if (!(await storyGroup.getByText("The debt", { exact: true }).isVisible())) await storyGroup.getByRole("button", { name: "▸" }).first().click();
    await expect(storyGroup.getByText("The debt", { exact: true })).toBeVisible();
    await expect(storyGroup.getByText("The priest", { exact: true })).toBeVisible();

    // A second paste: the main plot is kept, a known subplot is kept, a new one is added.
    await copy(page, "Plot: Something else entirely.\n\nSubplot the debt: Different words.\n\nSubplot The storm: It comes.");
    await choose(page, "Plots");
    await page.getByTestId("smart-paste-run").click();
    await expect(page.getByTestId("smart-paste-plot")).toHaveCount(3);
    await expect(page.getByTestId("smart-paste-plot").nth(0)).toHaveAttribute("data-status", "kept");
    await expect(page.getByTestId("smart-paste-plot").nth(1)).toHaveAttribute("data-status", "kept");
    await expect(page.getByTestId("smart-paste-plot").nth(2)).toHaveAttribute("data-status", "new");
    await page.getByTestId("smart-paste-apply").click();
    const after = (await entities(page, "misc"))[0]!;
    expect(after.attributes["story.plotMain"]).toBe("A keeper finds a door in the rock.");
    expect((after.attributes["story.subplots"] as any[]).map(s => [s.name, s.text])).toEqual([
      ["The debt", "Ilse owes her brother-in-law."],
      ["The priest", "He writes to the ministry."],
      ["The storm", "It comes."],
    ]);
  });

  test("script: styled clipboard text is formatted with the writer's words and inserted after the current scene", async ({ page }) => {
    await login(page);
    await createDoc(page, "Paste script");
    await seedScenes(page);
    await page.locator(".wui-el", { hasText: "It's all still here." }).click(); // the caret is in the first scene
    await page.getByRole("button", { name: "AI", exact: true }).click();

    await copyHtml(
      page,
      `<p>He waits.</p><p>int. cellar - night</p><p align="center">VOSS</p><p>Who is there?</p><p>Tom: Only me.</p>`,
      "He waits. int. cellar - night VOSS Who is there? Tom: Only me."
    );
    await choose(page, "Script");
    await expect(page.getByTestId("smart-paste-words")).toContainText("styled text");
    await page.getByTestId("smart-paste-run").click();
    await page.getByTestId("ai-consent-accept").click();

    const scenes = page.getByTestId("smart-paste-scene");
    await expect(scenes).toHaveCount(2);
    await expect(scenes.nth(0)).toContainText("(before the first scene heading)");
    await expect(scenes.nth(1)).toContainText("INT. CELLAR - NIGHT");
    await expect(page.getByTestId("smart-paste-target")).toContainText("after the scene INT. ARCHIVE - NIGHT");
    const before = await bodyTexts(page);
    expect(before).toHaveLength(5);

    await page.getByTestId("smart-paste-apply").click();
    await expect(page.getByTestId("smart-paste-note")).toContainText("Inserted 6 elements");
    expect(await bodyTexts(page)).toEqual([
      "INT. ARCHIVE - NIGHT",
      "QUINN",
      "It's all still here.",
      "He waits.",
      "INT. CELLAR - NIGHT",
      "VOSS",
      "Who is there?",
      "TOM",
      "Only me.",
      "EXT. ROOF - DAY",
      "Wind on the roof.",
    ]);
    await page.screenshot({ path: "../screenwriter_plans/.superpowers/sdd/frontend-smart-paste-script.png" });
  });

  test("story: the AI writes a script from the pasted story; too long a script paste is refused before anything is sent", async ({ page }) => {
    await login(page);
    await createDoc(page, "Paste story");
    await page.getByRole("button", { name: "AI", exact: true }).click();

    await copy(page, "A lighthouse keeper finds a door in the rock and opens it.");
    await choose(page, "Story");
    await page.getByTestId("smart-paste-run").click();
    await page.getByTestId("ai-consent-accept").click();
    await expect(page.getByTestId("smart-paste-scene")).toContainText("INT. FIXTURE ROOM - DAY");
    await expect(page.getByTestId("smart-paste-scene")).toContainText("This is a canned line.");
    expect(await bodyTexts(page)).toEqual([""]);
    await page.getByTestId("smart-paste-apply").click();
    const texts = await bodyTexts(page);
    expect(texts[0]).toBe("INT. FIXTURE ROOM - DAY");
    expect(texts).toHaveLength(4); // the empty starter was reused

    await copy(page, "word ".repeat(8001));
    await choose(page, "Script");
    await expect(page.getByTestId("smart-paste-too-long")).toContainText("at most 8,000 words");
    await expect(page.getByTestId("smart-paste-run")).toBeDisabled();
  });
});

test("without clipboard access the text can be pasted into a box instead", async ({ page }) => {
  await login(page);
  await createDoc(page, "Paste box");
  await page.getByRole("button", { name: "AI", exact: true }).click();
  await choose(page, "Plots");
  await expect(page.getByTestId("smart-paste-clip-error")).toBeVisible();
  await expect(page.getByTestId("smart-paste-run")).toBeDisabled();

  await page.getByTestId("smart-paste-box").evaluate(el => {
    const data = new DataTransfer();
    data.setData("text/html", "<h1>Outline</h1><p>A keeper finds a door.</p>");
    data.setData("text/plain", "Outline A keeper finds a door.");
    el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
  });
  await expect(page.getByTestId("smart-paste-excerpt")).toContainText("# Outline");
  await expect(page.getByTestId("smart-paste-words")).toContainText("styled text");
  await page.getByTestId("smart-paste-run").click();
  await page.getByTestId("ai-consent-accept").click();
  await expect(page.getByTestId("smart-paste-plot")).toHaveCount(1);
});
