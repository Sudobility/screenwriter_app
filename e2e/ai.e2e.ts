import { expect, test, type Page } from "@playwright/test";
import { spawn } from "node:child_process";
import { devUidForEmail } from "../../screenwriter_lib/src/auth/dev-auth";

const SHOTS = "/Users/johnhuang/projects/screenwriter_plans/.superpowers/sdd";
const API = `http://localhost:${Number(process.env.E2E_API_PORT ?? 18042)}`;
const API2_PORT = Number(process.env.E2E_API2_PORT ?? 18043);
const email = `e2e-ai-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
const AUTH = { Authorization: `Bearer dev:${devUidForEmail(email)}:${email}` };

const synced = (page: Page) => expect(page.getByTestId("sync-status")).toHaveAttribute("data-state", "synced");

const H = ["INT. KITCHEN - DAY", "EXT. ROOFTOP - DAWN", "INT. DINER - NIGHT"];
const LINES = ["nothing here works anymore.", "the wind is loud up here.", "we should not be talking."];
const seed = () => {
  const cmds: { id: string; params: Record<string, unknown> }[] = [];
  H.forEach((h, i) => {
    cmds.push({ id: "element.insert", params: { style: "st_scene_heading", text: h } });
    cmds.push({ id: "element.insert", params: { style: "st_action", text: `Something happens in scene ${i + 1}.` } });
    cmds.push({ id: "element.insert", params: { style: "st_character", text: "MAYA" } });
    cmds.push({ id: "element.insert", params: { style: "st_dialogue", text: LINES[i]! } });
  });
  return cmds;
};
const upperFirst = (t: string) => t.replace(/^\S+/, w => w.toUpperCase());

test("AI panel: test-mode banner, coverage review, polish suggestions, accept, stale refusal, reject", async ({ page }) => {
  page.on("pageerror", e => console.log("[pageerror]", e.message));
  page.on("console", m => {
    if (m.type() === "error") console.log("[console.error]", m.text());
  });

  await page.goto("/");
  await page.getByLabel("Dev login (email, no password)").fill(email);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.getByLabel("New project name").fill("AI project");
  await page.getByRole("button", { name: "Create project" }).click();
  await expect(page.getByRole("heading", { name: "Documents" })).toBeVisible();
  await page.getByLabel("Title", { exact: true }).fill("Three scenes");
  await page.getByRole("button", { name: "Create document" }).click();
  await expect(page).toHaveURL(/\/d\/(doc_[A-Za-z0-9]+)/);
  const did = /\/d\/(doc_[A-Za-z0-9]+)/.exec(page.url())![1]!;
  await expect(page.getByTestId("script-editor")).toBeVisible();
  await synced(page);

  await page.evaluate(c => {
    const s = (window as any).__fadewright.session;
    for (const el of [...s.model.elements()]) s.execute([{ id: "text.deleteBackward", params: { at: { elementId: el.id, offset: 0 }, unit: "element" } }]);
    for (const cmd of c) s.execute([cmd], { kind: "local-command" });
  }, seed());
  await synced(page);

  const sceneIds = () => page.evaluate(() => (window as any).__fadewright.session.model.scenes().map((s: any) => String(s.id)) as string[]);
  const apiElements = async () => {
    const r = await page.request.get(`${API}/api/v1/documents/${did}/content`, { headers: AUTH });
    expect(r.ok()).toBe(true);
    return (await r.json()).data.elements as { id: string; text: { plain: string } }[];
  };
  const apiTexts = async () => (await apiElements()).map(e => e.text.plain);
  const caretIn = () =>
    page.evaluate(() => {
      const sel = getSelection();
      const el = (sel?.anchorNode instanceof Element ? sel.anchorNode : sel?.anchorNode?.parentElement)?.closest("[data-el-id]") as HTMLElement | null;
      return el?.dataset.elId ?? null;
    });
  const line = (text: string) => page.locator(".wui-page [data-el-id]").filter({ hasText: text });
  const ids = await sceneIds();
  expect(ids).toHaveLength(3);

  // ---- open the panel: the persistent test-mode banner (the API runs with AI_TEST_MODE=1)
  await page.getByTestId("ai-button").click();
  const panel = page.getByTestId("ai-panel");
  await expect(panel).toBeVisible();
  await expect(page.getByTestId("ai-test-banner")).toHaveText("Test mode — these results are canned samples, not real AI output");
  // only one right panel at a time
  await page.getByRole("button", { name: "Snapshots" }).click();
  await expect(page.getByTestId("snapshots-panel")).toBeVisible();
  await expect(panel).toHaveCount(0);
  await page.getByTestId("ai-button").click();
  await expect(panel).toBeVisible();
  await expect(page.getByTestId("snapshots-panel")).toHaveCount(0);

  // ---- review the whole script
  await line("Something happens in scene 1.").click();
  await page.getByTestId("ai-review-button").click();
  await expect(page.getByTestId("ai-report")).toBeVisible();
  await expect(page.getByTestId("ai-report-summary")).toContainText("fixture summary");
  await expect(page.getByTestId("ai-verdict")).toHaveText("Consider");
  await expect(page.getByTestId("ai-test-banner")).toBeVisible(); // still there
  const sceneNotes = page.getByTestId("ai-scene-note");
  await expect(sceneNotes).toHaveCount(2);
  await panel.evaluate(el => el.scrollTo(0, 0));
  await page.screenshot({ path: `${SHOTS}/frontend-f7-review.png` });

  // ---- clicking a scene note jumps the editor to that scene (the last one)
  expect(await caretIn()).not.toBe(ids[2]);
  await sceneNotes.nth(1).click();
  await expect.poll(caretIn).toBe(ids[2]);
  await expect(page.getByTestId("view-edit")).toHaveAttribute("aria-selected", "true");

  // ---- the last report survives a reload
  await page.reload();
  await expect(page.getByTestId("script-editor")).toBeVisible();
  await page.getByTestId("ai-button").click();
  await expect(page.getByTestId("ai-report-summary")).toContainText("fixture summary");

  // ---- polish the current scene (scene 1): before/after diff
  await line("Something happens in scene 1.").click();
  await expect(page.getByTestId("ai-polish-scope")).toContainText(H[0]!);
  await page.getByTestId("ai-polish-button").click();
  const sug = page.getByTestId("ai-suggestion");
  await expect(sug).toHaveCount(1);
  await expect(sug.getByTestId("ai-diff-before")).toContainText(LINES[0]!);
  await expect(sug.getByTestId("ai-diff-before").locator("del")).toHaveText("nothing");
  await expect(sug.getByTestId("ai-diff-after")).toContainText(upperFirst(LINES[0]!));
  await expect(sug.getByTestId("ai-diff-after").locator("ins")).toHaveText("NOTHING");
  await panel.evaluate(el => el.scrollTo(0, el.scrollHeight));
  await page.screenshot({ path: `${SHOTS}/frontend-f7-polish-diff.png` });

  // ---- accept it: the editor updates live and the API agrees
  await page.getByTestId("ai-accept-selected").click();
  await expect(sug).toHaveAttribute("data-status", "accepted");
  await expect(line(upperFirst(LINES[0]!))).toBeVisible();
  await synced(page);
  await expect.poll(apiTexts).toContain(upperFirst(LINES[0]!));
  expect(await apiTexts()).not.toContain(LINES[0]!);

  // ---- a suggestion for scene 2 goes stale when the writer edits that line
  await line("Something happens in scene 2.").click();
  await expect(page.getByTestId("ai-polish-scope")).toContainText(H[1]!);
  await page.getByTestId("ai-polish-button").click();
  await expect(sug).toHaveCount(1);
  await expect(sug).toHaveAttribute("data-status", "pending");
  const suggestionElementId = (await sug.getAttribute("data-element-id"))!;
  const textOf = async (id: string) => (await apiElements()).find(e => e.id === id)?.text.plain;
  await line(LINES[1]!).click();
  await page.keyboard.type("REALLY ", { delay: 15 }); // wherever the click put the caret
  await synced(page);
  await expect.poll(() => textOf(suggestionElementId)).toContain("REALLY");
  const edited = (await textOf(suggestionElementId))!;
  await page.getByTestId("ai-accept-selected").click();
  await expect(page.getByTestId("ai-stale-message")).toContainText("The script changed since these suggestions were made");
  await expect(sug).toHaveAttribute("data-status", "stale");
  await page.screenshot({ path: `${SHOTS}/frontend-f7-stale.png` });
  // the writer's edit stands, in the editor and on the server
  await expect(line(edited)).toBeVisible();
  expect(await textOf(suggestionElementId)).toBe(edited);
  await expect(page.getByTestId("ai-error")).toHaveCount(0);

  // ---- reject a set: nothing changes
  await line("Something happens in scene 3.").click();
  await page.getByTestId("ai-polish-button").click();
  await expect(sug).toHaveCount(1);
  await expect(sug).toHaveAttribute("data-status", "pending");
  await expect(page.getByTestId("ai-stale-message")).toHaveCount(0);
  await page.getByTestId("ai-reject").click();
  await expect(sug).toHaveAttribute("data-status", "rejected");
  await expect(page.getByTestId("ai-set-counts")).toContainText("1 rejected");
  expect(await apiTexts()).toContain(LINES[2]!);
});

test("AI panel explains when AI is not configured", async ({ page }) => {
  // A second API with AI_TEST_MODE unset and no ShapeShyft env boots and reports 401 on /ai/status (it cannot
  // authenticate a dev token: the dev bypass exists only in test mode), so the panel is driven against the
  // fixture API with /ai/status answered as the unconfigured API would.
  const api2 = spawn("bun", ["run", "src/index.ts"], {
    cwd: "../screenwriter_api",
    env: {
      ...process.env,
      PORT: String(API2_PORT),
      DATABASE_URL: "postgres://localhost:5432/screenwriter_test",
      PUBLIC_APP_URL: `http://localhost:${Number(process.env.E2E_APP_PORT ?? 15173)}`,
      AI_TEST_MODE: "",
      SHAPESHYFT_ENDPOINT_URL: "",
      SHAPESHYFT_API_KEY: "",
      LOG_LEVEL: "error",
    },
    stdio: "ignore",
  });
  try {
    const base = `http://localhost:${API2_PORT}/api/v1`;
    for (let i = 0; i < 150; i++) {
      try {
        if ((await fetch(`${base}/health`)).ok) break;
      } catch {
        /* not up yet */
      }
      await new Promise(r => setTimeout(r, 200));
    }
    expect((await fetch(`${base}/health`)).ok).toBe(true);
    expect((await fetch(`${base}/ai/status`)).status).toBe(401);
    expect((await fetch(`${base}/ai/status`, { headers: { Authorization: "Bearer dev:x:x@x.co" } })).status).toBe(401);
  } finally {
    api2.kill("SIGTERM");
  }

  const mail = `e2e-ai-off-${Date.now()}@example.com`;
  await page.route("**/api/v1/ai/status", r =>
    r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, data: { available: false, mode: "unavailable" } }) })
  );
  await page.goto("/");
  await page.getByLabel("Dev login (email, no password)").fill(mail);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.getByLabel("New project name").fill("AI off");
  await page.getByRole("button", { name: "Create project" }).click();
  await page.getByLabel("Title", { exact: true }).fill("No AI");
  await page.getByRole("button", { name: "Create document" }).click();
  await expect(page.getByTestId("script-editor")).toBeVisible();
  await page.getByTestId("ai-button").click();
  await expect(page.getByTestId("ai-unavailable")).toContainText("AI is not configured");
  await expect(page.getByTestId("ai-review-button")).toHaveCount(0);
  await expect(page.getByTestId("ai-polish-button")).toHaveCount(0);
  await expect(page.getByTestId("ai-test-banner")).toHaveCount(0);
  await page.screenshot({ path: `${SHOTS}/frontend-f7-unavailable.png` });
});
