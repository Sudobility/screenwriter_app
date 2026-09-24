import { expect, test, type Page } from "@playwright/test";
import { devUidForEmail } from "../../screenwriter_lib/src/auth/dev-auth";

const SHOTS = "/Users/johnhuang/projects/screenwriter_plans/.superpowers/sdd";
const API = `http://localhost:${Number(process.env.E2E_API_PORT ?? 18042)}`;
const email = `e2e-structure-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
const AUTH = { Authorization: `Bearer dev:${devUidForEmail(email)}:${email}` };

const synced = (page: Page) => expect(page.getByTestId("sync-status")).toHaveAttribute("data-state", "synced");

const H = ["INT. KITCHEN - DAY", "EXT. ROOFTOP - DAWN", "INT. DINER - NIGHT", "EXT. HIGHWAY - DAY", "INT. STAIRWELL - EVENING", "INT. SERVER ROOM - NIGHT"];
const action = (i: number) => `Something happens in scene ${i + 1}.`;

function seedCommands() {
  const cmds: { id: string; params: Record<string, unknown> }[] = [];
  H.forEach((h, i) => {
    cmds.push({ id: "element.insert", params: { style: "st_scene_heading", text: h } });
    cmds.push({ id: "element.insert", params: { style: "st_action", text: action(i) } });
  });
  return cmds;
}

test("structure tools: navigator sidebar and index cards", async ({ page }) => {
  page.on("pageerror", e => console.log("[pageerror]", e.message));
  page.on("console", m => { if (m.type() === "error") console.log("[console.error]", m.text()); });

  await page.goto("/en/login");
  await page.getByLabel("Dev login (email, no password)").fill(email);
  await page.getByLabel("Password", { exact: true }).fill("x");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByLabel("New project name").fill("Structure project");
  await page.getByRole("button", { name: "Create project" }).click();
  await expect(page.getByRole("heading", { name: "Documents" })).toBeVisible();
  await page.getByLabel("Title", { exact: true }).fill("Six scenes");
  await page.getByRole("button", { name: "Create document" }).click();
  await expect(page).toHaveURL(/\/d\/(doc_[A-Za-z0-9]+)/);
  const did = /\/d\/(doc_[A-Za-z0-9]+)/.exec(page.url())![1]!;
  await expect(page.getByTestId("script-editor")).toBeVisible();
  await synced(page);

  // Seed programmatically, one command per execute().
  await page.evaluate(c => {
    const s = (window as any).__fadewright.session;
    // A new document starts with one empty scene heading: clear it so the script is exactly our six scenes.
    for (const el of [...s.model.elements()]) s.execute([{ id: "text.deleteBackward", params: { at: { elementId: el.id, offset: 0 }, unit: "element" } }]);
    for (const cmd of c) s.execute([cmd], { kind: "local-command" });
  }, seedCommands());
  await synced(page);

  const sceneIds = () => page.evaluate(() => (window as any).__fadewright.session.model.scenes().map((s: any) => String(s.id)) as string[]);
  const modelHeadings = () => page.evaluate(() => (window as any).__fadewright.session.model.scenes().map((s: any) => s.headingText) as string[]);
  const modelTexts = () => page.evaluate(() => (window as any).__fadewright.session.model.elements().map((e: any) => e.text.plain) as string[]);
  /** The true server copy: element order and synopses from GET /documents/:did/content. */
  const apiContent = async () => {
    const r = await page.request.get(`${API}/api/v1/documents/${did}/content`, { headers: AUTH });
    expect(r.ok()).toBe(true);
    return (await r.json()).data.elements as { text: { plain: string }; scene?: { synopsis: { plain: string } } }[];
  };
  const apiTexts = async () => (await apiContent()).map(e => e.text.plain);
  const caretIn = () =>
    page.evaluate(() => {
      const sel = getSelection();
      const el = (sel?.anchorNode instanceof Element ? sel.anchorNode : sel?.anchorNode?.parentElement)?.closest("[data-el-id]") as HTMLElement | null;
      return { id: el?.dataset.elId ?? null, focused: document.activeElement?.classList.contains("wui-page") ?? false };
    });

  // ---- Navigator: one row per scene, headings and numbers
  const nav = page.getByTestId("navigator");
  const rows = nav.locator("li[data-scene-id]");
  await expect(nav).toBeVisible();
  await expect(rows).toHaveCount(6);
  await expect(nav.getByTestId("nav-number")).toHaveText(["1", "2", "3", "4", "5", "6"]);
  await expect(nav.getByTestId("nav-heading")).toHaveText(H);
  let ids = await sceneIds();
  expect(ids).toHaveLength(6);

  // ---- click scene 4 -> the caret is in scene 4's heading
  await rows.nth(3).getByTestId("nav-heading").click();
  await expect(page.getByTestId("view-edit")).toHaveAttribute("aria-selected", "true");
  await expect.poll(caretIn).toEqual({ id: ids[3], focused: true });
  await expect(rows.nth(3)).toHaveAttribute("data-active", "true");

  // ---- the Navigator updates live while typing in the editor
  await page.keyboard.type("ZZ ", { delay: 15 }); // the caret sits at the start of the heading
  await expect(rows.nth(3).getByTestId("nav-heading")).toHaveText(`ZZ ${H[3]}`);
  await page.keyboard.press("Backspace");
  await page.keyboard.press("Backspace");
  await page.keyboard.press("Backspace");
  await expect(rows.nth(3).getByTestId("nav-heading")).toHaveText(H[3]!);
  // the active scene follows the caret: click into scene 6's action line
  await page.locator(`.wui-page [data-el-id]`).filter({ hasText: action(5) }).click();
  await expect(rows.nth(5)).toHaveAttribute("data-active", "true");
  await expect(nav.locator('[data-active="true"]')).toHaveCount(1);

  await page.screenshot({ path: `${SHOTS}/frontend-f6-navigator.png` });

  // ---- drag scene 4 above scene 2 in the Navigator
  await rows.nth(3).dragTo(rows.nth(1), { targetPosition: { x: 40, y: 3 } });
  const order1 = [H[0], H[3], H[1], H[2], H[4], H[5]];
  await expect(nav.getByTestId("nav-heading")).toHaveText(order1 as string[]);
  await expect(nav.getByTestId("nav-number")).toHaveText(["1", "2", "3", "4", "5", "6"]);
  const scriptOrder = (o: string[]) => o.flatMap(h => [h, action(H.indexOf(h))]);
  expect((await modelTexts()).slice(-12)).toEqual(scriptOrder(order1 as string[]));
  await synced(page);
  await expect.poll(async () => (await apiTexts()).slice(-12)).toEqual(scriptOrder(order1 as string[]));
  expect(await modelHeadings()).toEqual(order1);

  // ---- edit a synopsis inline, read it back from the API
  await rows.nth(2).getByTestId("nav-synopsis").click();
  await rows.nth(2).getByTestId("nav-synopsis-input").fill("Maya finds the note");
  await page.keyboard.press("Enter");
  await expect(rows.nth(2).getByTestId("nav-synopsis")).toHaveText("Maya finds the note");
  await synced(page);
  await expect
    .poll(async () => (await apiContent()).find(e => e.text.plain === order1[2])?.scene?.synopsis.plain)
    .toBe("Maya finds the note");

  // ---- Cards tab
  await page.getByTestId("view-cards").click();
  const cards = page.getByTestId("index-cards").locator("li[data-scene-id]");
  await expect(cards).toHaveCount(6);
  await expect(page.getByTestId("card-heading")).toHaveText(order1 as string[]);
  await expect(page.getByTestId("card-number")).toHaveText(["1", "2", "3", "4", "5", "6"]);
  await expect(cards.nth(2).getByTestId("card-synopsis")).toHaveText("Maya finds the note");
  await page.screenshot({ path: `${SHOTS}/frontend-f6-cards.png` });

  // drag card 5 to before card 1
  await cards.nth(4).dragTo(cards.nth(0), { targetPosition: { x: 8, y: 20 } });
  const order2 = [order1[4], order1[0], order1[1], order1[2], order1[3], order1[5]] as string[];
  await expect(page.getByTestId("card-heading")).toHaveText(order2);
  await synced(page);
  await expect.poll(async () => (await apiTexts()).slice(-12)).toEqual(scriptOrder(order2));
  await expect(nav.getByTestId("nav-heading")).toHaveText(order2); // the sidebar follows the script

  // edit a card's heading -> the scene heading text changes (server copy too)
  await cards.nth(3).getByTestId("card-heading").click();
  await cards.nth(3).getByTestId("card-heading-input").fill("EXT. ORCHARD - GOLDEN HOUR");
  await page.keyboard.press("Enter");
  await expect(cards.nth(3).getByTestId("card-heading")).toHaveText("EXT. ORCHARD - GOLDEN HOUR");
  expect((await modelHeadings())[3]).toBe("EXT. ORCHARD - GOLDEN HOUR");
  await synced(page);
  await expect.poll(async () => (await apiTexts()).includes("EXT. ORCHARD - GOLDEN HOUR")).toBe(true);
  await expect(nav.getByTestId("nav-heading").nth(3)).toHaveText("EXT. ORCHARD - GOLDEN HOUR");

  // add a card: a new scene appears at the end
  await page.getByTestId("add-card").click();
  await expect(cards).toHaveCount(7);
  await page.keyboard.press("Escape");
  expect((await sceneIds()).length).toBe(7);
  expect((await modelHeadings())[6]).toBe("INT. NEW SCENE - DAY");
  await synced(page);
  await expect.poll(async () => (await apiTexts()).at(-1)).toBe("INT. NEW SCENE - DAY");
  await expect(nav.locator("li[data-scene-id]")).toHaveCount(7);

  // double-click a card -> Edit with the caret in that scene's heading
  ids = await sceneIds();
  await cards.nth(1).getByTestId("card-number").dblclick();
  await expect(page.getByTestId("view-edit")).toHaveAttribute("aria-selected", "true");
  await expect.poll(caretIn).toEqual({ id: ids[1], focused: true });
});
