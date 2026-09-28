import { expect, test, type Page } from "@playwright/test";

/**
 * Element types at the keyboard, in a real browser: the type hint at the caret, Tab cycling through the types,
 * character names completing as a cue is typed, the automatic (CONT'D), and copy/paste keeping each line's type.
 */
const newEmail = () => `e2e-types-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
const synced = (page: Page) => expect(page.getByTestId("sync-status")).toHaveAttribute("data-state", "synced");

async function login(page: Page) {
  await page.goto("/en/login");
  await page.getByLabel("Dev login (email, no password)").fill(newEmail());
  await page.getByLabel("Password", { exact: true }).fill("x");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Projects", level: 1 })).toBeVisible();
}
async function createDoc(page: Page, title: string) {
  await page.getByLabel("New project name").fill("Types project");
  await page.getByRole("button", { name: "Create project" }).click();
  await expect(page.getByRole("heading", { name: "Documents" }).first()).toBeVisible();
  await page.getByLabel("Title", { exact: true }).fill(title);
  await page.getByRole("button", { name: "Create document" }).click();
  await expect(page).toHaveURL(/\/d\/doc_/);
  await expect(page.getByTestId("script-editor")).toBeVisible();
  await synced(page);
}
async function seed(page: Page) {
  await page.evaluate(() => {
    const s = (window as any).__fadewright.session;
    const starter = s.model.elements()[0].id as string;
    s.execute([{ id: "element.setStyle", params: { elements: [starter], style: "st_action" } }], { kind: "local-command" });
    const range = { anchor: { elementId: starter, offset: 0 }, head: { elementId: starter, offset: 0 } };
    s.execute([{ id: "text.replaceRange", params: { range, text: "He turns the photograph over." } }], { kind: "local-command" });
    for (const [style, text] of [
      ["st_scene_heading", "INT. OFFICE - DAY"],
      ["st_character", "adam"],
      ["st_parenthetical", "(quietly)"],
      ["st_dialogue", "WHO TOOK THIS"],
      ["st_character", "ANKER"],
      ["st_dialogue", "Not me."],
    ]) {
      s.execute([{ id: "element.insert", params: { before: starter, style, text } }], { kind: "local-command" });
    }
  });
  await expect(page.getByTestId("page-count")).toHaveAttribute("data-status", "ready", { timeout: 30_000 });
}
const rows = (page: Page) =>
  page.evaluate(() => ((window as any).__fadewright.session.model.elements() as any[]).map(e => [String(e.style), e.text.plain as string]));
const line = (page: Page, text: string) => page.locator(".wui-page [data-el-id]").filter({ hasText: text });

test("type hint, Tab through the types, character names, and the automatic CONT'D", async ({ page }) => {
  await login(page);
  await createDoc(page, "Types");
  await seed(page);

  const hint = page.getByTestId("type-hint");
  await line(page, "He turns the photograph over.").click();
  await expect(hint).toHaveCount(0); // a line with text needs no hint
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  // A new line: the type is shown at the caret.
  await expect(hint).toBeVisible();
  const first = await hint.getAttribute("data-type");
  expect(first).toBeTruthy();

  // Tab walks through the types; the hint follows.
  const seen = [first];
  for (let i = 0; i < 7; i++) {
    await page.keyboard.press("Tab");
    seen.push(await hint.getAttribute("data-type"));
  }
  expect(new Set(seen).size).toBe(7); // seven types, then round again
  expect(seen[7]).toBe(first);
  await page.keyboard.press("Shift+Tab");
  expect(await hint.getAttribute("data-type")).toBe(seen[6]);
  while ((await hint.getAttribute("data-type")) !== "Character") await page.keyboard.press("Tab");

  // Typing a cue: the known characters that match.
  await page.keyboard.type("a");
  const list = page.getByTestId("cue-complete");
  await expect(list).toBeVisible();
  await expect(page.getByTestId("cue-option")).toHaveText(["ADAM", "ANKER"]);
  await expect(hint).toHaveCount(0);
  await page.screenshot({ path: "../screenwriter_plans/.superpowers/sdd/frontend-cue-complete.png" });
  await page.keyboard.press("Enter"); // ADAM is highlighted
  await expect(list).toHaveCount(0);
  await page.keyboard.type("It is dated last week.");
  const all = await rows(page);
  expect(all.slice(-2)).toEqual([
    ["st_character", "ADAM"],
    ["st_dialogue", "It is dated last week."],
  ]);

  // Anker spoke in between, so no mark yet; with the mouse this time, a second Adam speech after an action line.
  await expect(line(page, "ADAM").last()).not.toHaveAttribute("data-contd", /.+/);
  await page.keyboard.press("Enter");
  await page.keyboard.type("He waits.");
  await page.keyboard.press("Enter");
  while ((await hint.getAttribute("data-type")) !== "Character") await page.keyboard.press("Tab");
  await page.keyboard.type("ad");
  await page.getByTestId("cue-option").filter({ hasText: "ADAM" }).click();
  await expect(list).toHaveCount(0);
  const cue = page.locator('.wui-page [data-el-id][data-role="character"]').last();
  await expect(cue).toHaveText("ADAM");
  await expect(cue).toHaveAttribute("data-contd", " (CONT'D)");
  expect(await cue.evaluate(el => getComputedStyle(el, "::after").content)).toContain("CONT'D");
  expect((await rows(page)).at(-1)).toEqual(["st_character", "ADAM"]); // shown, not stored
  await page.screenshot({ path: "../screenwriter_plans/.superpowers/sdd/frontend-contd.png" });
});

test("copy and paste keep each line's type", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await login(page);
  await createDoc(page, "Copy");
  await seed(page);

  // Select the first speech: from the start of the cue to the end of its dialogue.
  await line(page, "WHO TOOK THIS").click();
  await page.evaluate(() => {
    const blocks = [...document.querySelectorAll<HTMLElement>(".wui-page [data-el-id]")];
    const cue = blocks.find(b => b.textContent === "adam")!;
    const dialogue = blocks.find(b => b.textContent === "WHO TOOK THIS")!;
    const last = (n: Node): Node => (n.lastChild ? last(n.lastChild) : n);
    const end = last(dialogue);
    getSelection()!.setBaseAndExtent(cue, 0, end, end.textContent!.length);
  });
  await page.keyboard.press("ControlOrMeta+c");
  // Other programs get readable text, as shown.
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("ADAM\n(quietly)\nWHO TOOK THIS");

  await line(page, "He turns the photograph over.").click();
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await page.keyboard.press("ControlOrMeta+v");
  await expect.poll(async () => (await rows(page)).length).toBe(10);
  expect((await rows(page)).slice(-4)).toEqual([
    ["st_action", "He turns the photograph over."],
    ["st_character", "adam"],
    ["st_parenthetical", "(quietly)"],
    ["st_dialogue", "WHO TOOK THIS"],
  ]);

  // Text from another program is still read for its shape.
  await page.evaluate(() => navigator.clipboard.writeText("MAYA\nWe need more coffee."));
  await page.keyboard.press("Enter");
  await page.keyboard.press("ControlOrMeta+v");
  await expect.poll(async () => (await rows(page)).slice(-2)).toEqual([
    ["st_character", "MAYA"],
    ["st_dialogue", "We need more coffee."],
  ]);
  await synced(page);
});

test("script techniques are inserted at the caret with blanks to fill in", async ({ page }) => {
  await login(page);
  await createDoc(page, "Techniques");
  await seed(page);

  await line(page, "Not me.").click();
  await page.getByTestId("technique-menu").click();
  await expect(page.getByRole("option")).toHaveText([
    "Montage",
    "Series of shots",
    "Intercut",
    "Crosscutting (parallel action)",
    "Parallel scenes",
    "Split screen",
    "Time-lapse",
    "Flashback sequence",
    "Phone call (both sides seen)",
    "Phone call (one side heard)",
    "News broadcast",
    "Text message / social media",
  ]);
  await page.getByRole("option", { name: "Montage", exact: true }).click();
  await expect(page.getByTestId("technique-done")).toContainText("Montage inserted: fill in the 7 [bracketed] blanks.");
  expect((await rows(page)).slice(5, 12)).toEqual([
    ["st_dialogue", "Not me."],
    ["st_shot", "MONTAGE - [WHAT IT SHOWS]"],
    ["st_action", "-- [PLACE] -- [What we see.]"],
    ["st_action", "-- [PLACE] -- [What we see.]"],
    ["st_action", "-- [PLACE] -- [What we see.]"],
    ["st_shot", "END MONTAGE"],
    ["st_action", "He turns the photograph over."],
  ]);
  // The keyboard is back in the script, the caret at the start of the first inserted line; the menu can be used again at once.
  await page.keyboard.type("!");
  await expect.poll(async () => (await rows(page))[6]).toEqual(["st_shot", "!MONTAGE - [WHAT IT SHOWS]"]);
  await page.keyboard.press("Backspace");
  await expect(page.getByTestId("technique-menu")).toContainText("Insert technique");
  await page.screenshot({ path: "../screenwriter_plans/.superpowers/sdd/frontend-techniques.png" });

  await line(page, "He turns the photograph over.").click();
  await page.getByTestId("technique-menu").click();
  await page.getByRole("option", { name: "Flashback sequence", exact: true }).click();
  const all = await rows(page);
  expect(all.slice(-8).map(r => r[1])).toEqual([
    "BEGIN FLASHBACK:",
    "INT. [PLACE] - [DAY/NIGHT] - [YEAR, OR HOW LONG AGO]",
    "[What happened then.]",
    "[CHARACTER]",
    "[What was said.]",
    "END FLASHBACK.",
    "INT. [PLACE WE LEFT] - PRESENT DAY",
    "[Back where we were.]",
  ]);
  await synced(page);
});

test("a parenthetical gets its parentheses; a second speech straight away gets (CONT'D)", async ({ page }) => {
  await login(page);
  await createDoc(page, "Parens");
  await seed(page);
  const hint = page.getByTestId("type-hint");

  // After Anker's cue: a new line, made a parenthetical from the type menu.
  await line(page, "ANKER").click();
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await page.getByLabel("Element style").selectOption({ label: /Parenthetical/ } as never).catch(async () => {
    const value = await page.getByLabel("Element style").locator("option", { hasText: "Parenthetical" }).getAttribute("value");
    await page.getByLabel("Element style").selectOption(value!);
  });
  await expect.poll(async () => (await rows(page))[5]).toEqual(["st_parenthetical", "()"]);
  await page.keyboard.type("dryly"); // the caret is between the parentheses, the keyboard is in the script
  await expect.poll(async () => (await rows(page))[5]).toEqual(["st_parenthetical", "(dryly)"]);
  await page.keyboard.press("Enter"); // finishes the parenthetical
  expect((await rows(page)).slice(5, 8)).toEqual([
    ["st_parenthetical", "(dryly)"],
    ["st_dialogue", ""],
    ["st_dialogue", "Not me."],
  ]);

  // Tab onto Parenthetical and away again on the empty line: the parentheses come and go.
  await page.keyboard.press("Shift+Tab");
  await expect.poll(async () => (await rows(page))[6]).toEqual(["st_parenthetical", "()"]);
  await page.keyboard.press("Tab");
  await expect.poll(async () => (await rows(page))[6]).toEqual(["st_dialogue", ""]);
  await page.keyboard.press("Backspace"); // the empty line goes

  // Anker speaks, then speaks again as a new speech: the second cue is marked, in the editor and on the page.
  await line(page, "Not me.").click();
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  while ((await hint.getAttribute("data-type")) !== "Character") await page.keyboard.press("Tab");
  await page.keyboard.type("an");
  await page.keyboard.press("Enter"); // ANKER from the list
  await page.keyboard.type("Nor anyone I know.");
  const cues = page.locator('.wui-page [data-el-id][data-role="character"]');
  await expect(cues).toHaveText(["adam", "ANKER", "ANKER"]);
  await expect(cues.nth(2)).toHaveAttribute("data-contd", " (CONT'D)");
  await expect(cues.nth(1)).not.toHaveAttribute("data-contd", /.+/);
  await page.screenshot({ path: "../screenwriter_plans/.superpowers/sdd/frontend-parens-contd.png" });

  await page.getByTestId("view-pages").click();
  await expect(page.getByTestId("page-count")).toHaveAttribute("data-status", "ready", { timeout: 30_000 });
  await expect(page.getByText("ANKER (CONT'D)")).toBeVisible();
});
