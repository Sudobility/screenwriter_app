/**
 * Soak test: randomized, realistic editing sessions against the real stack, hunting two unexplained anomalies
 * (see screenwriter_plans/.superpowers/sdd/known-gaps.md): (1) Enter in the editor navigating to the project page,
 * (2) an Action element silently becoming st_character with no Tab key sent.
 *
 * Only Enter, Backspace, typing and clicks on other UI are ever sent (never Tab, never a style command), so every
 * element after the first MUST stay st_action and the URL MUST stay put. After every step the true element styles
 * are read back from the API and compared with the model of what the steps should have produced. On an anomaly
 * the test fails and prints the in-page causality log (window.__wuiDebug: every command, keydown, beforeinput,
 * change, focus move and history call) plus the recent step trace.
 *
 * Skipped unless SOAK=1. Run: SOAK=1 SOAK_SEEDS=1,2,3 SOAK_STEPS=60 bunx playwright test -c playwright.soak.config.ts
 */
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { execSync, spawn } from "node:child_process";
import { devUidForEmail } from "../../screenwriter_lib/src/auth/dev-auth";

const API = `http://localhost:${process.env.E2E_API_PORT ?? 18342}`;
const API_PORT = Number(process.env.E2E_API_PORT ?? 18342);

/** Kill whatever listens on our (non-default) API port and start the API again, as `bun --watch` would. */
async function restartApi() {
  if (API_PORT === 8036) throw new Error("refusing to touch the dev API port");
  try {
    execSync(`kill $(lsof -tiTCP:${API_PORT} -sTCP:LISTEN)`);
  } catch {
    /* not running */
  }
  await new Promise(r => setTimeout(r, 500));
  const child = spawn("bun", ["run", "src/index.ts"], {
    cwd: "../screenwriter_api",
    detached: true,
    stdio: "ignore",
    env: { ...process.env, PORT: String(API_PORT), DATABASE_URL: "postgres://localhost:5432/screenwriter_test", PUBLIC_APP_URL: `http://localhost:${process.env.E2E_APP_PORT ?? 15373}`, CORS_ORIGINS: `http://localhost:${process.env.E2E_APP_PORT ?? 15373}`, AI_TEST_MODE: "1" },
  });
  child.unref();
  for (let i = 0; i < 40; i++) {
    try {
      if ((await fetch(`http://localhost:${API_PORT}/api/v1/health`)).ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise(r => setTimeout(r, 250));
  }
  throw new Error("API did not come back");
}

const STEPS = Number(process.env.SOAK_STEPS ?? 40);
const SEEDS = (process.env.SOAK_SEEDS ?? String(Date.now() % 100000)).split(",").map(Number);

interface Doc {
  id: string;
  title: string;
  /** What the server should hold: element texts in order (all but the first are Action). */
  texts: string[];
  firstStyle: string | null;
  snaps: Map<string, string[]>;
}
interface Tab {
  page: Page;
  cur: Doc | null;
}
interface ServerEl {
  style: string;
  text: string;
}

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const WORDS = ["Rain", "streaks", "the", "window", "train", "night", "she", "waits", "coal", "smoke", "platform", "clock", "ticks"];

const INIT = () => {
  const w = window as unknown as { __wuiDebug: unknown[]; __nav: unknown[] };
  w.__wuiDebug = [];
  w.__nav = [];
  const desc = (el: unknown) => {
    const e = el as HTMLElement | null;
    if (!e || !e.tagName) return String(el);
    return `${e.tagName.toLowerCase()}${e.getAttribute?.("aria-label") ? `[${e.getAttribute("aria-label")}]` : ""}${e.className && typeof e.className === "string" ? "." + e.className.split(" ")[0] : ""}${e.tagName === "A" ? `->${e.getAttribute("href")}` : ""}`;
  };
  const push = (kind: string, data: Record<string, unknown>) => w.__wuiDebug.push({ t: Date.now(), kind, ...data });
  const install = () => {
    document.addEventListener("keydown", e => push("page-keydown", { key: e.key, target: desc(e.target), active: desc(document.activeElement), url: location.pathname }), true);
    document.addEventListener("change", e => push("page-change", { target: desc(e.target), value: (e.target as HTMLInputElement).value }), true);
    document.addEventListener("focusin", e => push("focusin", { target: desc(e.target) }), true);
    document.addEventListener("click", e => push("click", { target: desc(e.target) }), true);
  };
  install();
  for (const m of ["pushState", "replaceState"] as const) {
    const orig = history[m].bind(history);
    history[m] = (...a: Parameters<typeof history.pushState>) => {
      w.__nav.push({ t: Date.now(), m, to: String(a[2]), from: location.pathname, stack: (new Error().stack ?? "").split("\n").slice(2, 8).map(s => s.trim()) });
      push("history." + m, { to: String(a[2]), active: desc(document.activeElement) });
      return orig(...a);
    };
  }
  window.addEventListener("popstate", () => push("popstate", { url: location.pathname }));
};

test.skip(!process.env.SOAK, "set SOAK=1 to run the soak test");

for (const seed of SEEDS) {
  test(`soak seed ${seed}`, async ({ browser }) => {
    test.setTimeout(Math.max(180_000, STEPS * 25_000));
    const rand = rng(seed);
    const pick = <T,>(xs: T[]): T => xs[Math.floor(rand() * xs.length)]!;
    const chance = (p: number) => rand() < p;
    const email = `soak-${seed}-${Date.now()}@example.com`;
    const auth = { Authorization: `Bearer dev:${devUidForEmail(email)}:${email}` };
    const trace: string[] = [];
    const notes: string[] = [];
    const docs: Doc[] = [];
    let projectId = "";

    const ctx: BrowserContext = await browser.newContext({ viewport: { width: 1400, height: 900 } });
    await ctx.addInitScript(INIT);
    const tabs: Tab[] = [];
    const openTab = async (): Promise<Tab> => {
      const page = await ctx.newPage();
      page.on("pageerror", e => notes.push(`pageerror: ${e.message}`));
      const t: Tab = { page, cur: null };
      tabs.push(t);
      return t;
    };

    const step = (s: string) => {
      trace.push(`${new Date().toISOString().slice(11, 23)} ${s}`);
      if (process.env.SOAK_VERBOSE) console.log(`[seed ${seed}] ${s}`);
    };

    const dump = async (why: string): Promise<never> => {
      const lines: string[] = [`SOAK ANOMALY (seed ${seed}): ${why}`, "--- step trace (last 25) ---", ...trace.slice(-25)];
      for (const [i, t] of tabs.entries()) {
        const log = await t.page
          .evaluate(() => ({ dbg: (window as unknown as { __wuiDebug: unknown[] }).__wuiDebug.slice(-60), nav: (window as unknown as { __nav: unknown[] }).__nav, url: location.href }))
          .catch(() => null);
        lines.push(`--- tab ${i} url=${log?.url} ---`, "nav: " + JSON.stringify(log?.nav?.slice(-5)), ...(log?.dbg ?? []).map(e => JSON.stringify(e)));
      }
      lines.push("--- notes ---", ...notes.slice(-20));
      throw new Error(lines.join("\n"));
    };

    const serverEls = async (did: string): Promise<ServerEl[]> => {
      // The API may be mid-restart (chaos step): retry instead of hanging on a dead socket.
      for (let attempt = 0; ; attempt++) {
        try {
          const r = await fetch(`${API}/api/v1/documents/${did}/content`, { headers: auth, signal: AbortSignal.timeout(5000) });
          const j = (await r.json()) as { data?: unknown };
          return extract(j.data);
        } catch (e) {
          if (attempt >= 8) throw e;
          await new Promise(res => setTimeout(res, 500));
        }
      }
    };

    /** Tolerant reader for DocumentJSON: finds the ordered element list wherever it lives. */
    function extract(data: unknown): ServerEl[] {
      const d = data as Record<string, unknown> | undefined;
      const list = (d?.elements ?? (d?.content as Record<string, unknown> | undefined)?.elements ?? d?.body) as unknown;
      if (!Array.isArray(list)) throw new Error("unrecognised content shape: " + JSON.stringify(data).slice(0, 400));
      return list.map(e => {
        const el = e as Record<string, unknown>;
        return { style: String(el.style ?? el.styleId ?? ""), text: typeof el.text === "string" ? el.text : String((el.text as { plain?: string } | undefined)?.plain ?? "") };
      });
    }

    const check = async (d: Doc, settle: boolean): Promise<void> => {
      const deadline = Date.now() + (settle ? 9000 : 0);
      let els: ServerEl[] = [];
      for (;;) {
        els = await serverEls(d.id);
        // The style invariant is checked on every poll, whether or not the text has caught up.
        els.forEach((e, i) => {
          if (i === 0 && d.firstStyle === null && e.text !== "") d.firstStyle = e.style;
        });
        const bad = els.map((e, i) => ({ e, i })).filter(({ e, i }) => (i === 0 ? d.firstStyle !== null && e.style !== d.firstStyle : e.style !== "st_action"));
        if (bad.length) return dump(`doc "${d.title}" (${d.id}) has wrong style(s): ${bad.map(b => `#${b.i} ${b.e.style} "${b.e.text}"`).join("; ")}; server=${JSON.stringify(els)} expectedTexts=${JSON.stringify(d.texts)}`);
        const same = els.length === d.texts.length && els.every((e, i) => e.text === d.texts[i]);
        if (same) return;
        if (Date.now() >= deadline) break;
        await new Promise(r => setTimeout(r, 250));
      }
      if (settle) {
        notes.push(`TEXT-DIVERGENCE doc "${d.title}": expected ${JSON.stringify(d.texts)} server ${JSON.stringify(els.map(e => e.text))}`);
        step(`!! text divergence on ${d.title}; re-baselined`);
        d.texts = els.map(e => e.text);
      }
    };

    const checkAll = async (touched: Doc | null | undefined) => {
      for (const d of docs) await check(d, d === touched);
    };

    const guardUrl = async (t: Tab, want: RegExp | string, what: string) => {
      const u = new URL(t.page.url()).pathname;
      const ok = typeof want === "string" ? u === want : want.test(u);
      if (!ok) await dump(`URL changed unexpectedly after ${what}: now ${u}, wanted ${want}`);
    };

    const synced = async (t: Tab) => {
      await t.page.getByTestId("sync-status").waitFor({ timeout: 10_000 }).catch(() => undefined);
      await expect(t.page.getByTestId("sync-status"))
        .toHaveAttribute("data-state", "synced", { timeout: 8000 })
        .catch(() => notes.push("sync did not reach synced"));
    };

    const editorReady = async (t: Tab) => {
      await t.page.locator(".wui-page").waitFor({ timeout: 15_000 });
      await synced(t);
    };

    // ---------- session setup ----------
    const t0 = await openTab();
    await t0.page.goto("/en/login");
    await t0.page.getByLabel("Dev login (email, no password)").fill(email);
    await t0.page.getByLabel("Password", { exact: true }).fill("x");
    await t0.page.getByRole("button", { name: "Sign in", exact: true }).click();
    await t0.page.getByLabel("New project name").fill("Soak");
    await t0.page.getByRole("button", { name: "Create project" }).click();
    await expect(t0.page.getByRole("heading", { name: "Documents" })).toBeVisible();
    projectId = new URL(t0.page.url()).pathname.split("/")[2]!;
    const projectPath = `/en/p/${projectId}`;
    if (chance(0.5)) await openTab();

    // ---------- actions ----------
    const gotoProject = async (t: Tab) => {
      const back = t.page.getByRole("link", { name: /Project|Home/ }).first();
      if (t.cur && chance(0.6) && (await back.isVisible().catch(() => false))) {
        step(`tab: click "<- Project"`);
        await back.click();
      } else {
        step("tab: goto project url");
        await t.page.goto(projectPath);
      }
      t.cur = null;
      await expect(t.page.getByRole("heading", { name: "Documents" })).toBeVisible({ timeout: 15_000 });
    };

    const otherTabHas = (t: Tab, d: Doc) => tabs.some(o => o !== t && o.cur === d);

    const newDoc = async (t: Tab) => {
      if (!/\/p\//.test(t.page.url())) await gotoProject(t);
      const title = `Doc${docs.length + 1}-${seed}`;
      step(`create document ${title}`);
      await t.page.getByLabel("Title", { exact: true }).fill(title);
      await t.page.getByRole("button", { name: "Create document" }).click();
      await expect(t.page).toHaveURL(/\/d\/doc_/, { timeout: 15_000 });
      const id = new URL(t.page.url()).pathname.split("/")[2]!;
      const d: Doc = { id, title, texts: [], firstStyle: null, snaps: new Map() };
      docs.push(d);
      t.cur = d;
      if (chance(0.5)) await editorReady(t);
      else await t.page.locator(".wui-page").waitFor({ timeout: 15_000 });
      // The first heading, then Enter immediately (symptom 1).
      const first = chance(0.5) ? "INT. TRAIN CAR - NIGHT" : pick(WORDS) + " " + pick(WORDS);
      await typeText(t, first);
      step("Enter right after first heading");
      if (chance(0.5)) await frames(t); // otherwise Enter lands in the same tick as the last keystroke, as a script would
      await t.page.keyboard.press("Enter");
      d.texts.push("");
      await guardUrl(t, `/en/d/${d.id}`, "Enter after first heading in a new document");
    };

    const openDoc = async (t: Tab, d: Doc, how: "link" | "goto" | "reload") => {
      if (otherTabHas(t, d)) return;
      if (how === "reload" && t.cur === d) {
        step(`reload ${d.title}`);
        await t.page.reload();
      } else if (how === "goto") {
        step(`goto ${d.title} (full page load)`);
        await t.page.goto(`/en/d/${d.id}`);
      } else {
        if (!/\/p\//.test(t.page.url())) await gotoProject(t);
        step(`open ${d.title} via link (in-app)`);
        const link = t.page.getByRole("link", { name: d.title, exact: true });
        // A project page left open in another tab does not learn about documents created since it loaded.
        if (!(await link.isVisible().catch(() => false))) {
          await link.waitFor({ timeout: 1500 }).catch(async () => {
            step("(stale document list in this tab: reloading the project page)");
            await t.page.reload();
          });
        }
        await link.click({ timeout: 15_000 });
      }
      t.cur = d;
      await t.page.locator(".wui-page").waitFor({ timeout: 15_000 });
      if (chance(0.7)) await editorReady(t);
    };

    /** Type at the end of the last element (a user clicking below the text, then End). */
    // Let React re-render and restore the caret before the next gesture.
    const frames = (t: Tab) => t.page.evaluate(() => new Promise<void>(r => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
    const focusEnd = async (t: Tab) => {
      await frames(t);
      // Bottom-right corner of the last element: past the end of its last visual line, so the caret lands at the end
      // of the element even when it wraps.
      const last = t.page.locator(".wui-el").last();
      const box = await last.boundingBox();
      if (box) await last.click({ position: { x: Math.max(1, box.width - 2), y: Math.max(1, box.height - 2) } });
      else await last.click();
      await t.page.keyboard.press("End");
    };

    const typeText = async (t: Tab, s: string) => {
      const d = t.cur!;
      await focusEnd(t);
      step(`type "${s}" in ${d.title}`);
      await t.page.keyboard.type(s, { delay: chance(0.5) ? 25 : 60 });
      if (!(d.texts.length === 0 && chance(0.5))) await frames(t);
      if (d.texts.length === 0) d.texts.push("");
      d.texts[d.texts.length - 1] += s;
    };

    const editSteps = async (t: Tab) => {
      const d = t.cur!;
      const n = 1 + Math.floor(rand() * 4);
      for (let i = 0; i < n; i++) {
        const r = rand();
        if (r < 0.45) {
          await typeText(t, [pick(WORDS), pick(WORDS)].join(" "));
        } else if (r < 0.8) {
          await focusEnd(t);
          step(`Enter in ${d.title}`);
          await t.page.keyboard.press("Enter");
          await frames(t);
          if (d.texts.length === 0) d.texts.push("");
          // Enter on an empty Action is a no-op (flow.onEnter is null, enterAction -> 'none').
          else if (d.texts[d.texts.length - 1] !== "") d.texts.push("");
          await guardUrl(t, `/en/d/${d.id}`, "Enter");
        } else {
          await focusEnd(t);
          step(`Backspace in ${d.title}`);
          await t.page.keyboard.press("Backspace");
          await frames(t);
          const last = d.texts[d.texts.length - 1];
          if (last === "" && d.texts.length > 1) d.texts.pop();
          else if (last) d.texts[d.texts.length - 1] = last.slice(0, -1);
        }
      }
    };

    const snapshotUi = async (t: Tab) => {
      const d = t.cur!;
      const panel = t.page.getByTestId("snapshots-panel");
      if (!(await panel.isVisible().catch(() => false))) {
        step("click Snapshots");
        await t.page.getByRole("button", { name: "Snapshots" }).click();
        await panel.waitFor();
      }
      const r = rand();
      if (r < 0.35) {
        step("click into snapshot inputs and press Enter in an empty name (native validation)");
        await t.page.getByLabel("Snapshot name").click();
        await t.page.keyboard.press("Enter");
        await t.page.getByLabel("Snapshot note").click();
        await t.page.keyboard.type("draft note", { delay: 5 });
        await t.page.keyboard.press("Enter");
      } else if (r < 0.8) {
        const name = `S${d.snaps.size + 1}-${Math.floor(rand() * 1000)}`;
        step(`save snapshot ${name}`);
        await t.page.getByLabel("Snapshot name").click();
        await t.page.keyboard.type(name, { delay: 5 });
        if (chance(0.5)) await t.page.keyboard.press("Enter");
        else await t.page.getByRole("button", { name: "Save snapshot" }).click();
        await expect(t.page.locator(`[data-testid="snapshot-row"][data-snapshot-name="${name}"]`)).toBeVisible({ timeout: 10_000 });
        d.snaps.set(name, [...d.texts]);
      } else if (d.snaps.size > 0) {
        const [name, texts] = pick([...d.snaps.entries()]);
        step(`open snapshot ${name}`);
        const row = t.page.locator(`[data-testid="snapshot-row"][data-snapshot-name="${name}"]`);
        await row.getByRole("button", { name: "Open" }).click();
        await row.getByRole("button", { name: "Replace content" }).click();
        await expect(t.page.getByTestId("rebased-banner")).toBeVisible({ timeout: 15_000 });
        d.texts = [...texts];
        await editorReady(t);
      }
      if (chance(0.5)) {
        step("close snapshots panel");
        await t.page.getByRole("button", { name: "Close" }).click().catch(() => undefined);
      }
      await guardUrl(t, `/en/d/${d.id}`, "snapshot UI");
    };

    const otherUi = async (t: Tab) => {
      const r = rand();
      if (r < 0.4) {
        step("click the (idle) style picker without changing it");
        // Focus + Escape leaves the value alone; a click on a disabled/idle select must never restyle.
        await t.page.getByTestId("style-picker").focus().catch(() => undefined);
        await t.page.keyboard.press("Escape");
      } else if (r < 0.7) {
        step("click document title input, Enter (blurs), no edit");
        await t.page.getByLabel("Document title").click();
        await t.page.keyboard.press("Enter");
      } else {
        step("click status/blank area");
        await t.page.getByTestId("sync-status").click();
      }
      await guardUrl(t, `/en/d/${t.cur!.id}`, "other UI click");
    };

    // ---------- main loop ----------
    await newDoc(t0);
    await synced(t0);
    await checkAll(t0.cur);

    for (let i = 0; i < STEPS; i++) {
      const t = pick(tabs);
      if (t.page.url() === "about:blank") await t.page.goto(projectPath);
      const r = rand();
      const touched: Doc[] = [];
      try {
        if (r < 0.14 || docs.length === 0) {
          await newDoc(t);
          touched.push(t.cur!);
        } else if (r < 0.34) {
          // open another document in quick succession, sometimes without waiting for sync of the first
          const d = pick(docs);
          if (t.cur) touched.push(t.cur);
          if (t.cur && chance(0.5)) await synced(t);
          await openDoc(t, d, pick(["link", "goto", "reload"] as const));
          if (chance(0.5)) {
            const d2 = pick(docs);
            await openDoc(t, d2, pick(["link", "goto"] as const));
            touched.push(d2);
          }
          if (t.cur) touched.push(t.cur);
        } else if (r < 0.7) {
          if (!t.cur) await openDoc(t, pick(docs), "link");
          if (!t.cur || otherTabHas(t, t.cur)) continue;
          await editSteps(t);
          touched.push(t.cur);
        } else if (r < 0.82) {
          if (!t.cur) continue;
          await snapshotUi(t);
          touched.push(t.cur);
        } else if (r < 0.9) {
          if (!t.cur) continue;
          await otherUi(t);
          touched.push(t.cur);
        } else if (r < 0.95) {
          if (t.cur) touched.push(t.cur);
          await gotoProject(t);
        } else if (process.env.SOAK_CHAOS && r < 0.98) {
          // What a live dev session sees when `bun --watch` restarts the API under open pages: sockets drop, clients
          // reconnect and resync. (Only our own API port is ever touched.)
          step("chaos: restart the API");
          await restartApi();
        } else {
          // work on doc B in a second tab while doc A's tab sits idle
          if (tabs.length < 2) await openTab();
        }
      } catch (e) {
        if (String(e).includes("SOAK ANOMALY")) throw e;
        step(`step error: ${String(e).split("\n")[0]}`);
        notes.push(`step error: ${String(e).split("\n")[0]}`);
      }
      if (t.cur && t.page.url().includes("/d/")) await synced(t);
      await guardUrl(t, t.cur ? `/en/d/${t.cur.id}` : /^\/en(\/p\/.*)?$/, `step ${i}`);
      await checkAll(touched[touched.length - 1]);
      for (const d of touched) await check(d, true);
    }
    for (const t of tabs) if (t.cur) await synced(t);
    await new Promise(r => setTimeout(r, 1500));
    await checkAll(null);
    if (process.env.SOAK_VERBOSE) for (const d of docs) console.log(`[seed ${seed}] final ${d.title}: ${JSON.stringify(await serverEls(d.id))}`);
    console.log(`[soak seed ${seed}] ${STEPS} steps, ${docs.length} docs, ${trace.length} trace lines, notes: ${notes.length}`);
    for (const n of notes) console.log(`[soak seed ${seed}] note: ${n}`);
    await ctx.close();
  });
}

// Mechanism probe (not a soak): can a restyle happen with no Tab and no editor keystroke? Yes if keyboard focus reaches
// the ElementStylePicker's <select>: it stays enabled and keeps the editor's LAST selection after the editor blurs, and a
// letter typed on a focused <select> selects the option that starts with it and fires `change`.
test("mechanism: keys typed on the focused style picker restyle the stale selection", async ({ browser }) => {
  test.skip(!process.env.SOAK_MECH, "set SOAK_MECH=1");
  const email = `mech-${Date.now()}@example.com`;
  const auth = { Authorization: `Bearer dev:${devUidForEmail(email)}:${email}` };
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  await ctx.addInitScript(INIT);
  const page = await ctx.newPage();
  await page.goto("/en/login");
  await page.getByLabel("Dev login (email, no password)").fill(email);
  await page.getByLabel("Password", { exact: true }).fill("x");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByLabel("New project name").fill("Mech");
  await page.getByRole("button", { name: "Create project" }).click();
  await page.getByLabel("Title", { exact: true }).fill("Mech doc");
  await page.getByRole("button", { name: "Create document" }).click();
  await expect(page).toHaveURL(/\/d\/doc_/);
  const did = new URL(page.url()).pathname.split("/")[2]!;
  await page.locator(".wui-page").waitFor();
  await expect(page.getByTestId("sync-status")).toHaveAttribute("data-state", "synced");
  await page.locator(".wui-el").first().click();
  await page.keyboard.type("INT. ROOM - NIGHT", { delay: 20 });
  await page.keyboard.press("Enter");
  await page.keyboard.type("Rain streaks the window.", { delay: 20 });
  await expect(page.getByTestId("sync-status")).toHaveAttribute("data-state", "synced");
  const styles = async () => {
    const j = (await (await fetch(`${API}/api/v1/documents/${did}/content`, { headers: auth })).json()) as { data: { elements: { style: string }[] } };
    return j.data.elements.map(e => e.style);
  };
  await expect.poll(styles).toEqual(["st_scene_heading", "st_action"]);
  // Move keyboard focus off the editor by clicking the title, then Tab to the picker (title -> picker is the next stop).
  await page.getByLabel("Document title").click();
  await page.keyboard.press("Tab");
  await expect(page.getByTestId("style-picker")).toBeFocused();
  await expect(page.getByTestId("style-picker")).toBeEnabled();
  await page.keyboard.press("c");
  await expect.poll(styles, { timeout: 10_000 }).toEqual(["st_scene_heading", "st_character"]);
  console.log("[mech] typing 'c' on the focused picker restyled the stale selection's Action to st_character, no Tab in the editor");
  console.log(JSON.stringify(await page.evaluate(() => (window as unknown as { __wuiDebug: unknown[] }).__wuiDebug.filter((e: any) => /picker|change|exec/.test(e.kind)).slice(-4))));
  await ctx.close();
});
