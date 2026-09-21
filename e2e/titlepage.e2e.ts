import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";

const SHOTS = "/Users/johnhuang/projects/screenwriter_plans/.superpowers/sdd";
const email = `e2e-titlepage-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;

const synced = (page: Page) => expect(page.getByTestId("sync-status")).toHaveAttribute("data-state", "synced");

const ACTION = [
  "The rain keeps falling on the empty street while the neon sign flickers, and somebody far away starts to sing an old song nobody remembers.",
  "MAYA (30s) crosses the room without a word, picks up the phone, listens, and puts it down again as though it had said something she already knew.",
  "A door opens. A door closes. Nothing else happens for a very long time, which is exactly how she likes it.",
  "Short beat.",
];
const DIALOGUE = [
  "Twelve drafts. Not one of them knows how it ends, and I am running out of coffee and patience.",
  "You keep saying that as if the ending were a place we could drive to before the sun comes up.",
  "No.",
];

function seedCommands() {
  const cmds: { id: string; params: Record<string, unknown> }[] = [];
  const add = (style: string, text: string) => cmds.push({ id: "element.insert", params: { style, text } });
  for (let i = 0; i < 28; i++) {
    add("st_scene_heading", `${i % 2 ? "ext." : "int."} location number ${i + 1} - ${i % 3 ? "night" : "day"}`);
    add("st_action", ACTION[i % ACTION.length]!);
    add("st_character", i % 2 ? "Maya" : "Jonas");
    if (i % 3 === 0) add("st_parenthetical", "(quietly, to nobody in particular, while looking away)");
    add("st_dialogue", DIALOGUE[i % DIALOGUE.length]!);
    if (i % 6 === 5) add("st_transition", "cut to:");
  }
  return cmds;
}

/** Exports through the menu; a lossy conversion shows its report first (returned) and is confirmed with "Download anyway". */
async function exportAs(page: Page, id: string): Promise<{ text: string; report: string | null }> {
  await page.getByTestId("export-button").click();
  const download = page.waitForEvent("download");
  await page.getByTestId(`export-${id}`).click();
  const modal = page.getByTestId("export-report");
  let report: string | null = null;
  const shown = await modal.waitFor({ state: "visible", timeout: 4_000 }).then(() => true, () => false);
  if (shown) {
    report = await modal.innerText();
    await page.getByTestId("export-anyway").click();
  }
  return { text: readFileSync(await (await download).path(), "utf8"), report };
}

interface SheetInfo {
  page: string;
  header: string | null;
  footer: string | null;
  headerSlot: string | null;
  left: string[];
  right: string[];
  text: string;
}

const sheetInfo = (page: Page): Promise<SheetInfo[]> =>
  page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLElement>(".wui-sheet")).map(sh => {
      const q = (k: string) => Array.from(sh.querySelectorAll<HTMLElement>(`[data-deco="${k}"]`));
      return {
        page: sh.dataset.page ?? "",
        header: q("header")[0]?.textContent ?? null,
        headerSlot: q("header")[0]?.dataset.slot ?? null,
        footer: q("footer")[0]?.textContent ?? null,
        left: q("sceneNumber").filter(d => d.dataset.slot === "left").map(d => d.textContent ?? ""),
        right: q("sceneNumber").filter(d => d.dataset.slot === "right").map(d => d.textContent ?? ""),
        text: sh.textContent ?? "",
      };
    }),
  );

test("title page, headers/footers and scene numbers, end to end", async ({ page }) => {
  page.on("pageerror", e => console.log("[pageerror]", e.message));
  page.on("console", m => {
    if (m.type() === "error") console.log("[console.error]", m.text());
  });

  await page.goto("/");
  await page.getByLabel("Dev login (email, no password)").fill(email);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.getByLabel("New project name").fill("Title page project");
  await page.getByRole("button", { name: "Create project" }).click();
  await expect(page.getByRole("heading", { name: "Documents" })).toBeVisible();
  await page.getByLabel("Title", { exact: true }).fill("The Night Train");
  await page.getByRole("button", { name: "Create document" }).click();
  await expect(page).toHaveURL(/\/d\/doc_/);
  await expect(page.getByTestId("script-editor")).toBeVisible();
  await synced(page);

  // A script long enough for several pages, seeded through the session.
  const seeded = await page.evaluate(c => {
    const s = (window as any).__fadewright.session;
    for (const cmd of c) s.execute([cmd], { kind: "local-command" });
    return s.model.scenes().length;
  }, seedCommands());
  const scenes = seeded as number;
  expect(scenes).toBeGreaterThanOrEqual(28);
  const counter = page.getByTestId("page-count");
  await expect(counter).toHaveAttribute("data-status", "ready", { timeout: 30_000 });
  const bodyPages = Number(await counter.getAttribute("data-pages"));
  expect(bodyPages).toBeGreaterThan(2);

  // Baseline: no title page yet, the seeded placeholder counts as empty.
  await page.getByTestId("view-pages").click();
  await expect(page.locator(".wui-sheet")).toHaveCount(bodyPages);
  expect((await sheetInfo(page))[0]!.page).toBe("1");

  // 1. Title page panel: fields sync through title.setField.
  await page.getByTestId("title-button").click();
  await expect(page.getByTestId("title-panel")).toBeVisible();
  await page.getByTestId("title-title").fill("The Night Train");
  await page.getByTestId("title-author").fill("Jane Writer");
  await page.getByTestId("title-basedOn").fill("Based on the novel by A. Author");
  await page.getByTestId("title-contact").fill("jane@example.com\n555-0100");
  await page.getByTestId("title-draftDate").fill("First draft, 9/21/26");
  await page.getByTestId("title-copyright").fill("(c) 2026 Jane Writer");

  let sheets = page.locator(".wui-sheet");
  await expect(sheets).toHaveCount(bodyPages + 1, { timeout: 10_000 });
  let info = await sheetInfo(page);
  expect(info[0]!.page).toBe("title");
  expect(info[0]!.text).toContain("THE NIGHT TRAIN");
  expect(info[0]!.text).toContain("Jane Writer");
  expect(info[0]!.text).toContain("jane@example.com");
  expect(info[0]!.header).toBeNull();
  expect(info[1]!.page).toBe("1"); // page numbers do not count the title page
  expect(info[1]!.header).toBeNull();
  expect(info[2]!.page).toBe("2");
  expect(info[2]!.header).toBe("2.");
  // The page count is the body page count: unchanged by the title page.
  await expect(counter).toHaveAttribute("data-pages", String(bodyPages));

  // 2. Page setup: footer text with {title}, header page number.
  await page.getByTestId("setup-button").click();
  await expect(page.getByTestId("setup-panel")).toBeVisible();
  await expect(page.getByTestId("title-panel")).toBeHidden(); // one right panel at a time
  await expect(page.getByTestId("token-help")).toBeAttached();
  await page.getByTestId("footer-center").fill("{title} - {page}");
  await expect.poll(async () => (await sheetInfo(page))[2]!.footer).toBe("The Night Train - 2");
  info = await sheetInfo(page);
  expect(info[0]!.footer).toBeNull(); // title page
  expect(info[1]!.footer).toBeNull(); // page 1: footer off on the first page by default
  expect(info[1]!.header).toBeNull();
  for (const i of info.slice(2)) {
    expect(i.header).toBe(`${i.page}.`);
    expect(i.footer).toBe(`The Night Train - ${i.page}`);
  }
  // Page number position select moves the number; first-page toggle shows the header on page 1.
  await page.getByTestId("page-number-position").selectOption("center");
  await expect.poll(async () => (await sheetInfo(page))[2]!.headerSlot).toBe("center");
  await page.getByTestId("page-number-position").selectOption("right");
  await expect.poll(async () => (await sheetInfo(page))[2]!.headerSlot).toBe("right");
  await page.getByTestId("header-first-page").uncheck();
  await expect.poll(async () => (await sheetInfo(page))[1]!.header).toBe("1.");
  await page.getByTestId("header-first-page").check();
  await expect.poll(async () => (await sheetInfo(page))[1]!.header).toBeNull();

  // 3. Scene numbers: both margins.
  expect((await sheetInfo(page)).every(s => s.left.length === 0 && s.right.length === 0)).toBe(true);
  await page.getByTestId("scene-number-mode").selectOption("both");
  await expect.poll(async () => (await sheetInfo(page))[1]!.left.length).toBeGreaterThan(0);
  const numbered = await sheetInfo(page);
  const lefts = numbered.flatMap(s => s.left);
  const rights = numbered.flatMap(s => s.right);
  expect(lefts).toEqual(Array.from({ length: scenes }, (_, i) => String(i + 1)));
  expect(rights).toEqual(lefts);
  expect(numbered[1]!.left[0]).toBe("1");

  // The Navigator shows the same numbers, and the Edit view has the gutter number.
  await expect(page.getByTestId("navigator-sidebar").getByTestId("nav-number").first()).toHaveText("1");

  // 4. Omit a scene: it keeps its number slot (spec 02 section 21.2), its body stops printing.
  const omittedId = await page.evaluate(() => {
    const s = (window as any).__fadewright.session;
    const scene = s.model.scenes()[3];
    s.execute([{ id: "scene.setOmitted", params: { scene: scene.id, omitted: true } }]);
    return scene.id as string;
  });
  await expect.poll(async () => (await sheetInfo(page)).map(s => s.text).join("\n")).toContain("OMITTED");
  const afterOmit = await sheetInfo(page);
  expect(afterOmit.flatMap(s => s.left)).toEqual(Array.from({ length: scenes }, (_, i) => String(i + 1))); // no gap, no renumber
  await page.evaluate(id => (window as any).__fadewright.session.execute([{ id: "scene.setOmitted", params: { scene: id, omitted: false } }]), omittedId);
  await expect.poll(async () => (await sheetInfo(page)).map(s => s.text).join("\n")).not.toContain("OMITTED");

  // Speed view: scene numbers in a left gutter.
  await page.getByTestId("view-edit").click();
  await expect(page.locator('.wui-page [data-scene-num="1"]').first()).toBeVisible();
  await page.getByTestId("view-pages").click();

  // Screenshots, one whole sheet each.
  await page.getByTestId("setup-button").click(); // close the panel
  await page.setViewportSize({ width: 1400, height: 1250 });
  sheets = page.locator(".wui-sheet");
  await sheets.nth(0).screenshot({ path: `${SHOTS}/frontend-g3-titlepage.png` });
  await sheets.nth(2).screenshot({ path: `${SHOTS}/frontend-g3-header-scenenums.png` });
  await page.setViewportSize({ width: 1400, height: 900 });

  // 5. Export: the server's copy carries the title page, footer and scene numbers.
  await synced(page);
  const { text: fountain, report: fountainReport } = await exportAs(page, "fountain");
  expect(fountainReport).toMatch(/footer/i); // the ConversionReport says Fountain cannot carry the footer text
  expect(fountain).toContain("Title: The Night Train");
  expect(fountain).toContain("Author: Jane Writer");
  expect(fountain).toContain("Contact:");
  expect(fountain).toContain("jane@example.com");
  // The new document's empty starter heading is scene 1 (Fountain cannot write an empty heading), so location 1 is scene (scenes - 27).
  expect(fountain).toContain(`LOCATION NUMBER 1 - DAY #${scenes - 27}#`.toUpperCase());
  expect(fountain).toContain(`LOCATION NUMBER 28 - DAY #${scenes}#`.toUpperCase());
  const { text: fdx } = await exportAs(page, "fdx");
  expect(fdx).toContain("<TitlePage>");
  expect(fdx).toContain("The Night Train");
  expect(fdx).toContain("Jane Writer");
  expect(fdx).toContain('Number="1"');
  expect(fdx).toContain(`Number="${scenes}"`);
  expect(fdx).toContain("<HeaderAndFooter");
  expect(fdx).toContain('<DynamicLabel Type="Page #"/>');

  // Turning scene numbers off removes them everywhere.
  await page.getByTestId("setup-button").click();
  await page.getByTestId("scene-number-mode").selectOption("none");
  await expect.poll(async () => (await sheetInfo(page)).flatMap(s => s.left).length).toBe(0);
  await synced(page);
});
