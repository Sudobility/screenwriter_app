import { expect, test, type Page } from "@playwright/test";

const SHOTS = "/Users/johnhuang/projects/screenwriter_plans/.superpowers/sdd";
const email = `e2e-continueds-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;

const synced = (page: Page) => expect(page.getByTestId("sync-status")).toHaveAttribute("data-state", "synced");

// The sentence rule breaks a speech only after a sentence end, so every line must end one. "Hold that door." (15 chars)
// fits twice on a 35-column dialogue line (7 lines for 14 sentences) and once on a ~16-column dual half (14 lines).
const SPEECH = Array.from({ length: 14 }, () => "Hold that door.").join(" ");
const REPLY = Array.from({ length: 10 }, () => "Not a chance.").join(" ");

function seedCommands(beats: number) {
  const cmds: { id: string; params: Record<string, unknown> }[] = [];
  const add = (style: string, text: string) => cmds.push({ id: "element.insert", params: { style, text } });
  add("st_scene_heading", "int. station - night");
  for (let i = 0; i < beats; i++) add("st_action", `Beat ${i}.`);
  add("st_character", "Maya");
  add("st_dialogue", SPEECH);
  add("st_character", "Jonah");
  add("st_dialogue", REPLY);
  add("st_action", "Silence.");
  return cmds;
}

interface Box {
  text: string;
  side: string | null;
  left: number;
  top: number;
}

/** Generated lines (`.wui-gl`) and dual-side text lines of one sheet, with their drawn positions in inches. */
const boxes = (page: Page, sheet: number, selector: string): Promise<Box[]> =>
  page.evaluate(
    ([n, sel]) =>
      Array.from(document.querySelectorAll<HTMLElement>(".wui-sheet")[n as number]!.querySelectorAll<HTMLElement>(sel as string)).map(el => ({
        text: el.textContent ?? "",
        side: el.dataset.dualSide ?? null,
        left: parseFloat(el.style.left),
        top: parseFloat(el.style.top),
      })),
    [sheet, selector] as const,
  );

/** Screenshot of the bottom of sheet `n` and the top of sheet `n + 1`, stitched by clipping the page-view around their seam. */
async function seamShot(page: Page, n: number, path: string) {
  const sheets = page.locator(".wui-sheet");
  // Put the seam ~450px below the top of the viewport (scroll the nearest scrollable ancestor up a little from sheet n + 1).
  await sheets.nth(n + 1).evaluate(el => {
    el.scrollIntoView({ block: "start" });
    let p = el.parentElement;
    while (p && !(p.scrollHeight > p.clientHeight && /(auto|scroll)/.test(getComputedStyle(p).overflowY))) p = p.parentElement;
    (p ?? document.scrollingElement)?.scrollBy(0, -450);
  });
  const a = (await sheets.nth(n).boundingBox())!;
  const b = (await sheets.nth(n + 1).boundingBox())!;
  const y0 = Math.max(60, b.y - 430); // below the sticky top bar
  await page.screenshot({ path, clip: { x: a.x, y: y0, width: a.width, height: Math.min(800, b.y + 330 - y0) } });
}

test("continueds and dual dialogue, end to end", async ({ page }) => {
  page.on("pageerror", e => console.log("[pageerror]", e.message));
  page.on("console", m => {
    if (m.type() === "error") console.log("[console.error]", m.text());
  });

  await page.goto("/");
  await page.getByLabel("Dev login (email, no password)").fill(email);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.getByLabel("New project name").fill("Continueds project");
  await page.getByRole("button", { name: "Create project" }).click();
  await expect(page.getByRole("heading", { name: "Documents" })).toBeVisible();
  await page.getByLabel("Title", { exact: true }).fill("The Long Speech");
  await page.getByRole("button", { name: "Create document" }).click();
  await expect(page).toHaveURL(/\/d\/doc_/);
  await expect(page.getByTestId("script-editor")).toBeVisible();
  await synced(page);

  // The new document starts with one empty heading (1 row). heading + 22 one-line actions leave room for Maya's cue
  // and 4 of her 7 lines before the page bottom, so her speech straddles the first page break.
  await page.evaluate(c => {
    const s = (window as any).__fadewright.session;
    for (const cmd of c) s.execute([cmd], { kind: "local-command" });
  }, seedCommands(22));
  const counter = page.getByTestId("page-count");
  await expect(counter).toHaveAttribute("data-status", "ready", { timeout: 30_000 });
  await page.getByTestId("view-pages").click();
  const sheets = page.locator(".wui-sheet");
  await expect(sheets).toHaveCount(2);

  // 1. (MORE) at the bottom of page 1, NAME (CONT'D) at the top of page 2. Neither is a clickable line.
  await expect(sheets.nth(0).locator('.wui-gl[data-kind="more"]')).toHaveText("(MORE)");
  const cue = sheets.nth(1).locator('.wui-gl[data-kind="contdCue"]');
  await expect(cue).toHaveText("MAYA (CONT'D)");
  const more = (await boxes(page, 0, '.wui-gl[data-kind="more"]'))[0]!;
  const cued = (await boxes(page, 1, '.wui-gl[data-kind="contdCue"]'))[0]!;
  expect(cued.top).toBe(1); // the first body line of page 2 (1 in top margin)
  expect(more.top).toBeLessThan(10.5); // above the bottom margin
  expect(cued.left).toBe(more.left); // both sit in the character cue's geometry
  const firstAfter = (await boxes(page, 1, ".wui-pl"))[0]!;
  expect(firstAfter.top).toBeGreaterThan(cued.top); // the continued speech follows the cue line
  await page.setViewportSize({ width: 1400, height: 1300 });
  await seamShot(page, 0, `${SHOTS}/frontend-g4-continueds.png`);
  await page.setViewportSize({ width: 1400, height: 900 });

  // 2. Page setup: the toggles drive template.setContinueds.
  await page.getByTestId("setup-button").click();
  await page.getByTestId("continueds-more").uncheck();
  await expect(page.locator('.wui-gl[data-kind="more"], .wui-gl[data-kind="contdCue"]')).toHaveCount(0);
  await page.getByTestId("continueds-more").check();
  await expect(page.locator('.wui-gl[data-kind="more"]')).toHaveCount(1);
  await page.getByTestId("continueds-scene-bottom").check();
  await page.getByTestId("continueds-scene-top").check();
  await expect(sheets.nth(0).locator('.wui-gl[data-kind="continuedBottom"]')).toHaveText("(CONTINUED)");
  await expect(sheets.nth(1).locator('.wui-gl[data-kind="continuedTop"]')).toHaveText("CONTINUED:");
  await page.getByTestId("continueds-scene-bottom").uncheck();
  await expect(page.locator('.wui-gl[data-kind="continuedBottom"]')).toHaveCount(0);
  await expect(sheets.nth(1).locator('.wui-gl[data-kind="continuedTop"]')).toHaveCount(1);
  await page.getByTestId("continueds-scene-top").uncheck();
  await expect(page.locator('.wui-gl[data-kind="continuedTop"]')).toHaveCount(0);
  await page.getByTestId("setup-button").click(); // close

  // 3. Dual dialogue from the Edit view: caret in Jonah's block, then the toggle.
  await page.getByTestId("view-edit").click();
  const toggle = page.getByTestId("dual-toggle");
  await expect(toggle).toBeDisabled(); // no caret in a dialogue block yet
  await page.locator(".wui-el", { hasText: "Not a chance." }).click();
  await expect(toggle).toBeEnabled();
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  // A dual pair is two stacked blocks with a badge in the speed view.
  await expect(page.locator('.wui-el[data-dual="left"]')).toHaveCount(2); // Maya's cue and speech
  await expect(page.locator('.wui-el[data-dual="right"]')).toHaveCount(2);

  // The shortcut toggles it back off and on again (the caret stays in the editor).
  await page.keyboard.press("Control+Alt+D");
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator(".wui-el[data-dual]")).toHaveCount(0);
  await page.keyboard.press("Control+Alt+D");
  await expect(toggle).toHaveAttribute("aria-pressed", "true");

  // 4. Pages: the two speeches side by side; the cue lines share a y and differ in x.
  await page.getByTestId("view-pages").click();
  await expect(page.locator('.wui-pl[data-dual-side="right"]').first()).toBeVisible();
  const dual = await boxes(page, 0, ".wui-pl[data-dual-side]");
  const mayaCue = dual.find(b => b.text === "MAYA")!;
  const jonahCue = dual.find(b => b.text === "JONAH")!;
  expect(mayaCue.side).toBe("left");
  expect(jonahCue.side).toBe("right");
  expect(jonahCue.top).toBe(mayaCue.top); // same line
  expect(jonahCue.left).toBeGreaterThan(mayaCue.left + 1); // right half of the page
  const speeches = dual.filter(b => b.text !== "MAYA" && b.text !== "JONAH");
  expect(new Set(speeches.filter(b => b.side === "left").map(b => b.left)).size).toBe(1);
  expect(new Set(speeches.filter(b => b.side === "right").map(b => b.left)).size).toBe(1);
  // Each side's text keeps to its own half: right-side text starts right of every left-side line's start.
  const leftX = Math.max(...speeches.filter(b => b.side === "left").map(b => b.left));
  expect(Math.min(...speeches.filter(b => b.side === "right").map(b => b.left))).toBeGreaterThan(leftX + 1);
  // Two lines at the same y, one per side (the two speeches really are parallel).
  const tops = speeches.map(b => b.top);
  expect(tops.filter(t => speeches.some(o => o.side === "left" && o.top === t) && speeches.some(o => o.side === "right" && o.top === t)).length).toBeGreaterThan(0);
  // The dual block still breaks across the page: each side gets its own (MORE) and continuation cue.
  const dualMore = await boxes(page, 0, '.wui-gl[data-kind="more"]');
  expect(dualMore.map(b => b.side).sort()).toEqual(["left", "right"]);
  expect(dualMore[0]!.top).toBe(dualMore[1]!.top);
  const dualCues = await boxes(page, 1, '.wui-gl[data-kind="contdCue"]');
  expect(dualCues.map(b => b.text).sort()).toEqual(["JONAH (CONT'D)", "MAYA (CONT'D)"]);
  expect(dualCues[0]!.top).toBe(dualCues[1]!.top);

  await page.setViewportSize({ width: 1400, height: 1300 });
  await sheets.nth(0).scrollIntoViewIfNeeded();
  const first = (await sheets.nth(0).boundingBox())!;
  // The lower half of page 1 (where the pair sits) plus the top of page 2.
  await seamShot(page, 0, `${SHOTS}/frontend-g4-dual.png`);
  expect(first.width).toBeGreaterThan(700);
  await page.setViewportSize({ width: 1400, height: 900 });

  // 5. The pairing survives to the server: clearing it (button) restacks the layout.
  await synced(page);
  await page.getByTestId("view-edit").click();
  await page.locator(".wui-el", { hasText: "Not a chance." }).click();
  await toggle.click();
  await expect(page.locator(".wui-el[data-dual]")).toHaveCount(0);
  await page.getByTestId("view-pages").click();
  await expect(page.locator(".wui-pl[data-dual-side]")).toHaveCount(0);
  await synced(page);
});
