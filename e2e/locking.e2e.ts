import { expect, test, type Page } from "@playwright/test";

const SHOTS = "/Users/johnhuang/projects/screenwriter_plans/.superpowers/sdd";
const email = `e2e-locking-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;

const synced = (page: Page) => expect(page.getByTestId("sync-status")).toHaveAttribute("data-state", "synced");

/** Scene 1 is the starter heading; scenes 2..6 get 14 one-line actions each, so the script runs about four pages. */
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
  header: string | null;
  left: string[];
  right: string[];
  text: string;
}

const sheetInfo = (page: Page): Promise<SheetInfo[]> =>
  page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLElement>(".wui-sheet:not(.wui-sheet-title)")).map(sh => {
      const q = (k: string) => Array.from(sh.querySelectorAll<HTMLElement>(`[data-deco="${k}"]`));
      return {
        page: sh.dataset.page ?? "",
        header: q("header")[0]?.textContent ?? null,
        left: q("sceneNumber").filter(d => d.dataset.slot === "left").map(d => d.textContent ?? ""),
        right: q("sceneNumber").filter(d => d.dataset.slot === "right").map(d => d.textContent ?? ""),
        text: sh.textContent ?? "",
      };
    }),
  );

const navNumbers = (page: Page) => page.getByTestId("nav-number").allTextContents();
const sceneIds = (page: Page) => page.evaluate(() => (window as any).__fadewright.session.model.scenes().map((s: any) => String(s.id)) as string[]);

test("omit, scene locking, page locking and A pages, end to end", async ({ page }) => {
  page.on("pageerror", e => console.log("[pageerror]", e.message));
  page.on("console", m => {
    if (m.type() === "error") console.log("[console.error]", m.text());
  });

  await page.goto("/");
  await page.getByLabel("Dev login (email, no password)").fill(email);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.getByLabel("New project name").fill("Locking project");
  await page.getByRole("button", { name: "Create project" }).click();
  await expect(page.getByRole("heading", { name: "Documents" })).toBeVisible();
  await page.getByLabel("Title", { exact: true }).fill("Locked Script");
  await page.getByRole("button", { name: "Create document" }).click();
  await expect(page).toHaveURL(/\/d\/doc_/);
  await expect(page.getByTestId("script-editor")).toBeVisible();
  await synced(page);

  await page.evaluate(c => {
    const s = (window as any).__fadewright.session;
    for (const cmd of c) s.execute([cmd], { kind: "local-command" });
  }, seedCommands());
  await expect(page.getByTestId("page-count")).toHaveAttribute("data-status", "ready", { timeout: 30_000 });
  expect((await sceneIds(page)).length).toBe(6);

  // Scene numbers on (both margins).
  await page.getByTestId("setup-button").click();
  await page.getByTestId("scene-number-mode").selectOption("both");
  await expect(page.getByTestId("lock-scenes")).toBeEnabled();
  await page.getByTestId("setup-button").click(); // close
  expect(await navNumbers(page)).toEqual(["1", "2", "3", "4", "5", "6"]);

  // 1. Omit a scene from the Navigator (right-click menu); Edit view shows the badge, Pages prints OMITTED.
  const rows = page.locator("[data-scene-id]");
  await rows.nth(1).click({ button: "right" });
  await page.getByTestId("nav-omit").click();
  await expect(rows.nth(1).locator(".wui-nav-omitted")).toHaveText("OMITTED");
  await expect(page.locator(".wui-el[data-omitted-heading]")).toHaveCount(1);
  expect(await navNumbers(page)).toEqual(["1", "2", "3", "4", "5", "6"]); // an omitted scene keeps its number
  await page.getByTestId("view-pages").click();
  await expect(page.locator(".wui-sheet:not(.wui-sheet-title)").first()).toBeVisible();
  await expect.poll(async () => (await sheetInfo(page)).some(s => s.text.includes("OMITTED")), { message: "OMITTED printed in the Pages view" }).toBe(true);
  expect((await sheetInfo(page)).map(s => s.text).join(" ")).not.toContain("Scene 2 beat 3.");

  // Restore from the toolbar button (caret in the scene) in the Edit view.
  await page.getByTestId("view-edit").click();
  const omitToggle = page.getByTestId("omit-toggle");
  await expect(omitToggle).toBeDisabled();
  await page.locator(".wui-el[data-omitted-heading]").click();
  await expect(omitToggle).toHaveText("Restore scene");
  await omitToggle.click();
  await expect(page.locator(".wui-el[data-omitted-heading]")).toHaveCount(0);
  await expect(rows.nth(1).locator(".wui-nav-omitted")).toHaveCount(0);
  // ...and omit again with the shortcut, then restore through the menu on the row's button.
  await page.keyboard.press("Control+Alt+O");
  await expect(page.locator(".wui-el[data-omitted-heading]")).toHaveCount(1);
  await rows.nth(1).hover();
  await rows.nth(1).getByTestId("nav-omit-btn").click();
  await page.getByTestId("nav-omit").click();
  await expect(page.locator(".wui-el[data-omitted-heading]")).toHaveCount(0);

  // 2. Lock scene numbers, then insert a scene after scene 3: it is 3A everywhere.
  await page.getByTestId("setup-button").click();
  await page.getByTestId("lock-scenes").click();
  await expect(page.getByTestId("scene-lock-status")).toContainText("Scene numbers locked at");
  await page.getByTestId("setup-button").click();
  await page.evaluate(() => {
    const s = (window as any).__fadewright.session;
    const scenes = s.model.scenes();
    const last = scenes[2].elementIds[scenes[2].elementIds.length - 1];
    s.execute([{ id: "element.insert", params: { after: last, style: "st_scene_heading", text: "int. new place - night" } }], { kind: "local-command" });
  });
  await expect.poll(() => navNumbers(page)).toEqual(["1", "2", "3", "3A", "4", "5", "6"]);
  await expect(page.locator('.wui-el[data-scene-num="3A"]')).toHaveCount(1); // Edit gutter
  await page.setViewportSize({ width: 1400, height: 1000 });
  await page.locator('.wui-el[data-scene-num="3A"]').scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${SHOTS}/frontend-g5-locked-scenes.png` });
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.getByTestId("view-pages").click();
  await expect(page.locator(".wui-sheet:not(.wui-sheet-title)").first()).toBeVisible();
  let info = await sheetInfo(page);
  expect(info.flatMap(s => s.left)).toEqual(["1", "2", "3", "3A", "4", "5", "6"]);
  expect(info.flatMap(s => s.right)).toEqual(["1", "2", "3", "3A", "4", "5", "6"]);

  // 3. Lock pages (with a confirmation), then pile lines onto page 1: an A page appears, later pages keep their labels.
  const before = await sheetInfo(page);
  expect(before.length).toBeGreaterThanOrEqual(3);
  await page.getByTestId("setup-button").click();
  await page.getByTestId("lock-pages").click();
  await page.getByTestId("lock-pages-cancel").click();
  await expect(page.getByTestId("page-lock-status")).toContainText("not locked");
  await page.getByTestId("lock-pages").click();
  await page.getByTestId("lock-pages-ok").click();
  await expect(page.getByTestId("page-lock-status")).toContainText("Pages locked at");
  await page.getByTestId("setup-button").click();
  const headersBefore = (await sheetInfo(page)).map(s => s.header);
  expect(headersBefore.slice(1)).toEqual(before.slice(1).map((_, i) => `${i + 2}.`));

  await page.evaluate(() => {
    const s = (window as any).__fadewright.session;
    const first = s.model.scenes()[0].id;
    for (let i = 0; i < 60; i++) s.execute([{ id: "element.insert", params: { after: first, style: "st_action", text: `Added line ${i}.` } }], { kind: "local-command" });
  });
  await expect(page.getByTestId("page-count")).toHaveAttribute("data-status", "ready");
  await expect.poll(async () => (await sheetInfo(page)).length).toBeGreaterThan(before.length);
  info = await sheetInfo(page);
  const headers = info.map(s => s.header);
  expect(headers[1]).toBe("1A.");
  // Every page after the overflow keeps its old label, in the old order.
  expect(headers.slice(headers.length - (before.length - 1))).toEqual(headersBefore.slice(1));
  // The seam between page 1 and the first A page: bottom of sheet 0 above, the "1A." header at the top of sheet 1.
  await page.locator(".wui-sheet").nth(1).evaluate(el => {
    el.scrollIntoView({ block: "start" });
    let p = el.parentElement;
    while (p && !(p.scrollHeight > p.clientHeight && /(auto|scroll)/.test(getComputedStyle(p).overflowY))) p = p.parentElement;
    (p ?? document.scrollingElement)?.scrollBy(0, -320);
  });
  await page.screenshot({ path: `${SHOTS}/frontend-g5-apage.png` });

  // 4. Unlock: sequential numbering reflows.
  await page.getByTestId("setup-button").click();
  await page.getByTestId("unlock-pages").click();
  await expect(page.getByTestId("page-lock-status")).toContainText("not locked");
  await page.getByTestId("unlock-scenes").click();
  await expect(page.getByTestId("scene-lock-status")).toContainText("not locked");
  await page.getByTestId("setup-button").click();
  // Unlocked pagination is dense again, so the count may shrink; whatever it is, the labels are plain 2., 3., ...
  await expect
    .poll(async () => {
      const h = (await sheetInfo(page)).map(s => s.header).slice(1);
      return h.length > 0 && h.every((t, i) => t === `${i + 2}.`);
    })
    .toBe(true);
  await expect.poll(() => navNumbers(page)).toEqual(["1", "2", "3", "4", "5", "6", "7"]);
});
