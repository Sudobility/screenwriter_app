import { expect, test, type Page } from "@playwright/test";
import { writeFileSync } from "node:fs";

const SHOTS = "/Users/johnhuang/projects/screenwriter_plans/.superpowers/sdd";
const email = `e2e-pages-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;

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

/** ~130 elements: 28 scenes of heading, action, character, [parenthetical], dialogue, plus a transition every sixth scene. */
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

test("page view: layout engine pages, count, click-to-edit, print", async ({ page }) => {
  page.on("pageerror", e => console.log("[pageerror]", e.message));
  page.on("console", m => { if (m.type() === "error") console.log("[console.error]", m.text()); });

  // login, project, document
  await page.goto("/en/login");
  await page.getByLabel("Dev login (email, no password)").fill(email);
  await page.getByLabel("Password", { exact: true }).fill("x");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByLabel("New project name").fill("Pages project");
  await page.getByRole("button", { name: "Create project" }).click();
  await expect(page.getByRole("heading", { name: "Documents" })).toBeVisible();
  await page.getByLabel("Title", { exact: true }).fill("Long script");
  await page.getByRole("button", { name: "Create document" }).click();
  await expect(page).toHaveURL(/\/d\/doc_/);
  await expect(page.getByTestId("script-editor")).toBeVisible();
  await synced(page);

  // seed programmatically through the lib's session (not typed)
  const cmds = seedCommands();
  const ok = await page.evaluate((c) => {
    const s = (window as any).__fadewright.session;
    // One command per call: within a batch `element.insert` appends after a stale "last element" and scrambles the order.
    for (const cmd of c) s.execute([cmd], { kind: "local-command" });
    return { count: s.model.elementCount() };
  }, cmds);
  expect(ok.count).toBeGreaterThanOrEqual(110);
  console.log("seeded elements:", ok.count);
  await synced(page);

  // the top bar page count appears (engine chunk loads lazily) and grows past one page
  const counter = page.getByTestId("page-count");
  await expect(counter).toHaveAttribute("data-status", "ready", { timeout: 30_000 });
  const pageCount = Number(await counter.getAttribute("data-pages"));
  expect(pageCount).toBeGreaterThan(1);
  await expect(counter).toHaveText(`${pageCount} pages`);

  // wrapping agreement: browser-wrapped speed view vs the engine, per element
  const speed = await page.evaluate(() => {
    const out: Record<string, number> = {};
    document.querySelectorAll<HTMLElement>(".wui-page [data-el-id]").forEach(el => {
      const lh = parseFloat(getComputedStyle(el).lineHeight);
      out[el.dataset.elId!] = Math.round(el.getBoundingClientRect().height / lh);
    });
    return out;
  });

  // Pages tab
  await page.getByTestId("view-pages").click();
  const view = page.getByTestId("page-view");
  await expect(view).toBeVisible();
  const sheets = page.locator(".wui-sheet");
  await expect(sheets).toHaveCount(pageCount);
  await expect(page.getByTestId("print-button")).toBeVisible();

  const structure = await page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLElement>(".wui-sheet")).map(sh => ({
      n: Number(sh.dataset.page),
      lines: Array.from(sh.querySelectorAll<HTMLElement>(".wui-pl")).map(l => ({ id: l.dataset.elId!, text: l.textContent!, top: parseFloat(l.style.top) })),
      number: sh.querySelector('[data-deco="header"]')?.textContent ?? null,
    })),
  );
  if (process.env.E2E_DEBUG) for (const p of structure) console.log(p.n, p.lines.length, JSON.stringify(p.lines[0]!.text), JSON.stringify(p.lines.at(-1)!.text));
  expect(structure[0]!.lines.length).toBeLessThanOrEqual(54);
  expect(structure[0]!.lines.length).toBeGreaterThan(20);
  expect(structure[0]!.number).toBeNull();
  expect(structure[1]!.number).toBe("2.");
  for (const p of structure) {
    expect(p.lines.length).toBeLessThanOrEqual(54);
    const last = p.lines[p.lines.length - 1]!;
    expect(last.text, `page ${p.n} must not end on a scene heading`).not.toMatch(/^(INT|EXT)\. /);
  }
  // wrapped-line agreement
  const engine: Record<string, number> = {};
  for (const p of structure) for (const l of p.lines) engine[l.id] = (engine[l.id] ?? 0) + 1;
  const mismatches = Object.keys(engine).filter(id => speed[id] !== undefined && speed[id] !== engine[id]).map(id => ({ id, speed: speed[id], engine: engine[id] }));
  console.log(`wrapping agreement: ${Object.keys(engine).length} elements compared, ${mismatches.length} mismatches`, JSON.stringify(mismatches.slice(0, 5)));
  writeFileSync("/private/tmp/claude-501/-Users-johnhuang-projects/a2a0a0c2-70be-4d96-acd1-5938b30dc7cf/scratchpad/f5-wrap.json", JSON.stringify({ compared: Object.keys(engine).length, mismatches }));
  expect(mismatches).toEqual([]);

  await page.setViewportSize({ width: 1400, height: 1250 }); // a whole 11 in sheet fits: the scroller clips element shots
  await sheets.first().screenshot({ path: `${SHOTS}/frontend-f5-page1.png` });
  await sheets.nth(Math.min(3, pageCount - 1)).screenshot({ path: `${SHOTS}/frontend-f5-page-later.png` });
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.screenshot({ path: `${SHOTS}/frontend-f5-pages-view.png` });

  // print: only sheets, one per physical page
  await page.emulateMedia({ media: "print" });
  await expect(page.locator("header")).toBeHidden();
  const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true });
  const pdfPages = (pdf.toString("latin1").match(/\/Type\s*\/Page[^s]/g) ?? []).length;
  console.log("pdf pages:", pdfPages, "layout pages:", pageCount);
  expect(pdfPages).toBe(pageCount);
  await page.emulateMedia({ media: "screen" });

  // click a dialogue line on a later page -> Edit with the caret in that element
  const target = structure[Math.min(2, pageCount - 1)]!.lines.find(l => /^(Twelve|You keep|No\.)/i.test(l.text))!;
  await sheets.nth(Math.min(2, pageCount - 1)).locator(`.wui-pl[data-el-id="${target.id}"]`).first().click();
  await expect(page.getByTestId("view-edit")).toHaveAttribute("aria-selected", "true");
  await expect(page.getByTestId("script-editor")).toBeVisible();
  const caretIn = () =>
    page.evaluate(() => {
      const sel = getSelection();
      const el = (sel?.anchorNode instanceof Element ? sel.anchorNode : sel?.anchorNode?.parentElement)?.closest("[data-el-id]") as HTMLElement | null;
      return { id: el?.dataset.elId ?? null, focused: document.activeElement?.classList.contains("wui-page") ?? false };
    });
  await expect.poll(caretIn).toEqual({ id: target.id, focused: true });

  // an edit in Edit view shows up in the Pages view after the debounce
  await page.keyboard.press("End");
  await page.keyboard.type(" ZZTOP-EDIT", { delay: 10 });
  await page.getByTestId("view-pages").click();
  await expect(view).toContainText("ZZTOP-EDIT", { timeout: 5_000 });

  // more content while in Pages view: the sheets and the top-bar count follow
  const before = Number(await counter.getAttribute("data-pages"));
  await page.evaluate((c) => { for (const cmd of c) (window as any).__fadewright.session.execute([cmd]); }, cmds);
  await expect.poll(async () => Number(await counter.getAttribute("data-pages")), { timeout: 10_000 }).toBeGreaterThan(before);
  const after = Number(await counter.getAttribute("data-pages"));
  await expect(sheets).toHaveCount(after);
  await expect(counter).toHaveText(`${after} pages`);
  await synced(page);
});
