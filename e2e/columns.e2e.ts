import { expect, test, type Page } from "@playwright/test";

const SHOTS = "/Users/johnhuang/projects/screenwriter_plans/.superpowers/sdd";
const email = `e2e-columns-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;

const synced = (page: Page) => expect(page.getByTestId("sync-status")).toHaveAttribute("data-state", "synced");

type Cmd = { style: string; text: string };

async function createDoc(page: Page, project: boolean, title: string, template: string) {
  if (project) {
    await page.getByLabel("New project name").fill("Columns project");
    await page.getByRole("button", { name: "Create project" }).click();
  }
  await expect(page.getByRole("heading", { name: "Documents" })).toBeVisible();
  await page.getByLabel("Title", { exact: true }).fill(title);
  await page.getByLabel("Template").selectOption({ label: template });
  await page.getByRole("button", { name: "Create document" }).click();
  await expect(page).toHaveURL(/\/d\/doc_/);
  await expect(page.getByTestId("script-editor")).toBeVisible();
  await synced(page);
}

/**
 * Put the given elements ahead of the template's starter element (which is turned into a trailing empty action),
 * through the same command path the editor uses.
 */
async function seed(page: Page, rows: Cmd[]) {
  await page.evaluate(rs => {
    const s = (window as any).__fadewright.session;
    const starter = s.model.elements()[0].id as string;
    s.execute([{ id: "element.setStyle", params: { elements: [starter], style: "st_action" } }], { kind: "local-command" });
    for (const r of rs) s.execute([{ id: "element.insert", params: { before: starter, style: r.style, text: r.text } }], { kind: "local-command" });
  }, rows);
  await expect(page.getByTestId("page-count")).toHaveAttribute("data-status", "ready", { timeout: 30_000 });
}

interface LineBox {
  text: string;
  col: string | null;
  left: number;
  top: number;
}
const lines = (page: Page): Promise<LineBox[]> =>
  page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLElement>('.wui-sheet[data-page="1"] .wui-pl')).map(el => ({
      text: el.textContent ?? "",
      col: el.dataset.column ?? null,
      left: parseFloat(el.style.left),
      top: parseFloat(el.style.top),
    })),
  );

async function openPages(page: Page, waitFor: string) {
  await page.getByTestId("view-pages").click();
  await expect(page.locator(".wui-sheet:not(.wui-sheet-title)").first()).toBeVisible();
  await expect.poll(async () => (await lines(page)).some(l => l.text === waitFor)).toBe(true);
}

test("columns: AV two-column, BBC name-beside-dialogue and graphic novel panels", async ({ page }) => {
  page.on("pageerror", e => console.log("[pageerror]", e.message));
  page.on("console", m => {
    if (m.type() === "error") console.log("[console.error]", m.text());
  });

  await page.goto("/en/login");
  await page.getByLabel("Dev login (email, no password)").fill(email);
  await page.getByLabel("Password", { exact: true }).fill("x");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();

  // ---- AV: video (Action, column 1) beside audio (Character/Dialogue, column 2). ----
  await createDoc(page, true, "AV script", "AV Script (Two-Column)");
  await seed(page, [
    { style: "st_scene_heading", text: "int. studio - day" },
    { style: "st_action", text: "Wide shot of floor." },
    { style: "st_action", text: "Camera pushes in." },
    { style: "st_character", text: "host" },
    { style: "st_dialogue", text: "Welcome to the show." },
    { style: "st_action", text: "Cut to the guest." },
    { style: "st_character", text: "guest" },
    { style: "st_dialogue", text: "Glad to be here." },
  ]);

  // The style picker in the Edit view says which styles are column 1 / column 2.
  await page.getByTestId("view-edit").click();
  const options = await page.getByTestId("style-picker").locator("option").allTextContents();
  expect(options.some(o => /Action.*column 1/.test(o))).toBe(true);
  expect(options.some(o => /Dialogue.*column 2/.test(o))).toBe(true);

  await openPages(page, "HOST");
  const av = await lines(page);
  const video = av.find(l => l.text === "Wide shot of floor.")!;
  const host = av.find(l => l.text === "HOST")!;
  expect(video.col).toBe("1");
  expect(host.col).toBe("2");
  expect(host.left).toBeGreaterThan(video.left + 2); // side by side
  expect(host.top).toBe(video.top); // same first line
  const dialogue = av.find(l => l.text === "Welcome to the show.")!;
  expect(dialogue.left).toBe(host.left);
  const cut = av.find(l => l.text === "Cut to the guest.")!;
  const guest = av.find(l => l.text === "GUEST")!;
  expect(cut.top).toBeGreaterThan(dialogue.top); // an action after dialogue drops into a new row...
  expect(guest.top).toBe(cut.top); // ...beside the next audio
  await page.screenshot({ path: `${SHOTS}/frontend-g7-av.png` });

  // Enter in the Edit view follows the template's flow: Dialogue -Enter-> Action (video), a new row on the Pages view.
  await page.getByTestId("view-edit").click();
  const before = await page.evaluate(() => (window as any).__fadewright.session.model.elementCount());
  await page.locator(".wui-el", { hasText: "Glad to be here." }).click();
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await expect.poll(() => page.evaluate(() => (window as any).__fadewright.session.model.elementCount())).toBe(before + 1);
  const style = await page.evaluate(() => {
    const els = (window as any).__fadewright.session.model.elements() as { style: string; text: { plain: string } }[];
    const i = els.findIndex(e => e.text.plain === "Glad to be here.");
    return els[i + 1]!.style;
  });
  expect(style).toBe("st_action");

  // ---- BBC stage play: name beside dialogue. ----
  await page.getByRole("link", { name: "Project" }).click();
  await createDoc(page, false, "BBC play", "Stage Play (BBC)");
  await seed(page, [
    { style: "st_scene_heading", text: "the kitchen" },
    { style: "st_character", text: "anna" },
    { style: "st_dialogue", text: "Is the kettle on?" },
    { style: "st_character", text: "ben" },
    { style: "st_parenthetical", text: "(quietly)" },
    { style: "st_dialogue", text: "It is." },
  ]);
  await openPages(page, "BEN");
  const bbc = await lines(page);
  const anna = bbc.find(l => l.text === "ANNA")!;
  const ask = bbc.find(l => l.text === "Is the kettle on?")!;
  expect(anna.col).toBe("1");
  expect(ask.col).toBe("2");
  expect(ask.left).toBeGreaterThan(anna.left);
  expect(ask.top).toBe(anna.top);
  const ben = bbc.find(l => l.text === "BEN")!;
  expect(ben.top).toBeGreaterThan(ask.top);
  expect(bbc.find(l => l.text === "(quietly)")!.top).toBe(ben.top);

  // ---- Graphic novel: pages and panels. ----
  await page.getByRole("link", { name: "Project" }).click();
  await createDoc(page, false, "Comic", "Graphic Novel");
  await seed(page, [
    { style: "st_page", text: "" },
    { style: "st_panel", text: "" },
    { style: "st_action", text: "A rainy street at night. A lone figure under a red umbrella." },
    { style: "st_character", text: "maya" },
    { style: "st_dialogue", text: "Not again." },
    { style: "st_panel", text: "" },
    { style: "st_action", text: "Close on her eyes." },
    { style: "st_page", text: "" },
    { style: "st_panel", text: "" },
    { style: "st_action", text: "The door swings open." },
    { style: "st_panel", text: "Wide." },
    { style: "st_action", text: "Everyone turns to look." },
    { style: "st_panel", text: "" },
    { style: "st_action", text: "Silence." },
  ]);
  await openPages(page, "PAGE ONE (TWO PANELS)");
  await expect(page.locator(".wui-sheet:not(.wui-sheet-title)")).toHaveCount(2);
  const sheetText = (n: number) =>
    page.evaluate(k => Array.from(document.querySelectorAll<HTMLElement>(`.wui-sheet[data-page="${k}"] .wui-pl`)).map(e => e.textContent ?? ""), n);
  const p1 = await sheetText(1);
  const p2 = await sheetText(2);
  expect(p1[0]).toBe("PAGE ONE (TWO PANELS)");
  expect(p1).toContain("Panel 1.");
  expect(p1).toContain("Panel 2.");
  expect(p2[0]).toBe("PAGE TWO (THREE PANELS)");
  expect(p2.filter(t => t.startsWith("Panel"))).toEqual(["Panel 1.", "Panel 2. Wide.", "Panel 3."]); // numbering restarts on each page
  await page.screenshot({ path: `${SHOTS}/frontend-g7-panels.png` });
});
