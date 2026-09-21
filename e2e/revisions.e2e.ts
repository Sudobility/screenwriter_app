import { expect, test, type Page } from "@playwright/test";

const SHOTS = "/Users/johnhuang/projects/screenwriter_plans/.superpowers/sdd";
const email = `e2e-revisions-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;

const synced = (page: Page) => expect(page.getByTestId("sync-status")).toHaveAttribute("data-state", "synced");

/** Scenes 2..6 get 14 one-line actions each, so the script runs about four pages. */
function seedCommands() {
  const cmds: { id: string; params: Record<string, unknown> }[] = [];
  const add = (style: string, text: string) => cmds.push({ id: "element.insert", params: { style, text } });
  for (let i = 0; i < 6; i++) add("st_action", `Opening beat ${i}.`);
  for (let s = 2; s <= 6; s++) {
    add("st_scene_heading", `int. room ${s} - day`);
    for (let i = 0; i < 14; i++) add("st_action", `Scene ${s} beat ${i}.`);
  }
  return cmds;
}

interface SheetInfo {
  page: string;
  marks: string[];
  label: string | null;
  labelDeco: string | null;
}

const sheets = (page: Page): Promise<SheetInfo[]> =>
  page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLElement>(".wui-sheet:not(.wui-sheet-title)")).map(sh => ({
      page: sh.dataset.page ?? "",
      marks: Array.from(sh.querySelectorAll<HTMLElement>('[data-testid="rev-mark"]')).map(m => m.textContent ?? ""),
      label: sh.dataset.revLabel ?? null,
      labelDeco: sh.querySelector<HTMLElement>('[data-deco="revision"]')?.textContent ?? null,
    })),
  );

/** M/D/YY for today's local date: what the app's date input defaults to and what the header prints. */
const todayLabel = () => {
  const d = new Date();
  return `${d.getMonth() + 1}/${d.getDate()}/${String(d.getFullYear() % 100).padStart(2, "0")}`;
};

/** The id of the first line-0 element on a Pages sheet, skipping the first few (headings, short lines). */
const elementOnPage = (page: Page, sheetNumber: number, nth: number) =>
  page.evaluate(
    ([n, k]) => {
      const lines = Array.from(document.querySelectorAll<HTMLElement>(`.wui-sheet[data-page="${n}"] .wui-pl[data-line="0"]`));
      return lines[k as number]?.dataset.elId ?? "";
    },
    [sheetNumber, nth] as const,
  );

/** Real typing: Edit view, click the block, End, type. Goes through beforeinput -> text.insert -> the revision write policy. */
async function typeInto(page: Page, elementId: string, text: string) {
  await page.getByTestId("view-edit").click();
  const block = page.locator(`.wui-el[data-el-id="${elementId}"]`);
  await block.scrollIntoViewIfNeeded();
  await block.click();
  await page.keyboard.press("End");
  await page.keyboard.type(text);
  await expect(block).toContainText(text.trim());
}

test("revisions: sets, marks, page labels, mode off, clearing and the Revised pages list", async ({ page }) => {
  page.on("pageerror", e => console.log("[pageerror]", e.message));
  page.on("console", m => {
    if (m.type() === "error") console.log("[console.error]", m.text());
  });

  await page.goto("/");
  await page.getByLabel("Dev login (email, no password)").fill(email);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.getByLabel("New project name").fill("Revisions project");
  await page.getByRole("button", { name: "Create project" }).click();
  await expect(page.getByRole("heading", { name: "Documents" })).toBeVisible();
  await page.getByLabel("Title", { exact: true }).fill("Revised Script");
  await page.getByRole("button", { name: "Create document" }).click();
  await expect(page).toHaveURL(/\/d\/doc_/);
  await expect(page.getByTestId("script-editor")).toBeVisible();
  await synced(page);

  await page.evaluate(c => {
    const s = (window as any).__fadewright.session;
    for (const cmd of c) s.execute([cmd], { kind: "local-command" });
  }, seedCommands());
  await expect(page.getByTestId("page-count")).toHaveAttribute("data-status", "ready", { timeout: 30_000 });

  // Clean script: no marks, no labels.
  await page.getByTestId("view-pages").click();
  await expect(page.locator(".wui-sheet:not(.wui-sheet-title)").first()).toBeVisible();
  let info = await sheets(page);
  expect(info.length).toBeGreaterThanOrEqual(4);
  expect(info.every(s => s.marks.length === 0 && s.labelDeco === null)).toBe(true);
  const line2 = await elementOnPage(page, 2, 5);
  const line3 = await elementOnPage(page, 3, 5);
  const line1 = await elementOnPage(page, 1, 8);
  expect(new Set([line1, line2, line3]).size).toBe(3);

  // 1. Open Revisions, start Blue (the default next colour). The top bar shows REV: Blue.
  await page.getByTestId("revisions-button").click();
  await expect(page.getByTestId("revisions-panel")).toBeVisible();
  await expect(page.getByTestId("rev-indicator")).toHaveCount(0);
  await expect(page.getByTestId("rev-mode-toggle")).toBeDisabled();
  await expect(page.getByTestId("rev-set-select").locator("option:checked")).toHaveText("Blue");
  await page.getByTestId("rev-start").click();
  await expect(page.getByTestId("rev-indicator")).toHaveText("REV: Blue");
  await expect(page.getByTestId("rev-mode-toggle")).toHaveAttribute("aria-pressed", "true");

  // 2. Edit a line on page 2: Pages shows one asterisk beside it and the Blue header label on that page only.
  await typeInto(page, line2, " MOD");
  await page.getByTestId("view-pages").click();
  await expect(page.locator(".wui-sheet:not(.wui-sheet-title)").first()).toBeVisible();
  await expect.poll(async () => (await sheets(page)).flatMap(s => s.marks).length).toBe(1);
  info = await sheets(page);
  const blueLabel = `Blue Revised ${todayLabel()}`;
  const s2 = info.find(s => s.page === "2")!;
  expect(s2.marks).toEqual(["*"]);
  expect(s2.labelDeco).toBe(blueLabel);
  expect(info.filter(s => s.page !== "2").every(s => s.marks.length === 0 && s.labelDeco === null)).toBe(true);
  await expect(page.locator(`.wui-sheet[data-page="2"] .wui-pl[data-el-id="${line2}"] [data-testid="rev-mark"]`)).toHaveText("*");

  // 3. Start Pink and edit a line on page 3: that page says Pink, page 2 keeps Blue.
  await expect(page.getByTestId("rev-set-blue")).toHaveAttribute("data-marked", "1");
  await page.getByTestId("rev-start").click(); // the default next colour is now Pink
  await expect(page.getByTestId("rev-indicator")).toHaveText("REV: Pink");
  await typeInto(page, line3, " PINKED");
  await page.getByTestId("view-pages").click();
  await expect.poll(async () => (await sheets(page)).flatMap(s => s.marks).length).toBe(2);
  info = await sheets(page);
  expect(info.find(s => s.page === "3")!.labelDeco).toBe(`Pink Revised ${todayLabel()}`);
  expect(info.find(s => s.page === "2")!.labelDeco).toBe(blueLabel);
  expect(info.find(s => s.page === "1")!.labelDeco).toBeNull();

  // 4. Revision Mode off: an edit adds no marks.
  await page.getByTestId("rev-mode-toggle").click();
  await expect(page.getByTestId("rev-indicator")).toHaveCount(0);
  await typeInto(page, line1, " QUIET");
  await page.getByTestId("view-pages").click();
  await expect(page.locator(".wui-sheet:not(.wui-sheet-title)").first()).toBeVisible();
  await expect(page.locator(`.wui-pl[data-el-id="${line1}"]`)).toContainText("QUIET");
  info = await sheets(page);
  expect(info.flatMap(s => s.marks)).toHaveLength(2);
  expect(info.find(s => s.page === "1")!.labelDeco).toBeNull();
  await expect(page.getByTestId("rev-set-blue")).toHaveAttribute("data-marked", "1");
  await expect(page.getByTestId("rev-set-pink")).toHaveAttribute("data-marked", "1");

  // 5. Revised pages list: Blue -> 2, Pink -> 3; the link jumps to that page in the Pages tab.
  const groups = await page.getByTestId("rev-pages-set").allTextContents();
  expect(groups.map(g => g.replace(/\s+/g, " ").trim())).toEqual(["Blue: 2", "Pink: 3"]);
  await page.setViewportSize({ width: 1400, height: 1000 });
  await page.getByTestId("view-edit").click();
  await page.getByTestId("rev-pages-set").nth(1).getByTestId("rev-page-link").click();
  await expect(page.getByTestId("page-view")).toBeVisible();
  await expect(page.locator('.wui-sheet[data-page="3"][data-jumped="1"]')).toHaveCount(1);
  await page.locator('.wui-sheet[data-page="2"]').evaluate(el => el.scrollIntoView({ block: "start" }));
  await page.screenshot({ path: `${SHOTS}/frontend-g6-revisions.png` });

  // 6. Clear the Blue marks: page 2 loses its asterisk and label, Pink stays. Then clear everything.
  await page.getByTestId("rev-set-blue").getByTestId("rev-clear-set").click();
  await expect(page.getByTestId("rev-set-blue")).toHaveAttribute("data-marked", "0");
  await expect.poll(async () => (await sheets(page)).flatMap(s => s.marks).length).toBe(1);
  info = await sheets(page);
  expect(info.find(s => s.page === "2")!.labelDeco).toBeNull();
  expect(info.find(s => s.page === "3")!.labelDeco).toBe(`Pink Revised ${todayLabel()}`);
  await page.getByTestId("rev-clear-all").click();
  await expect.poll(async () => (await sheets(page)).flatMap(s => s.marks).length).toBe(0);
  info = await sheets(page);
  expect(info.every(s => s.labelDeco === null)).toBe(true);
  await expect(page.getByTestId("rev-pages")).toContainText("No revised pages");
  // The text edits themselves survive clearing.
  await expect(page.locator(`.wui-pl[data-el-id="${line2}"]`)).toContainText("MOD");
  await expect(page.locator(`.wui-pl[data-el-id="${line3}"]`)).toContainText("PINKED");
});
