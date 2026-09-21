import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SHOTS = "/Users/johnhuang/projects/screenwriter_plans/.superpowers/sdd";
const HERE = dirname(fileURLToPath(import.meta.url));
const fx = (n: string) => join(HERE, "fixtures", n);
const email = `e2e-formats-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;

const editorText = (page: Page) => page.locator(".wui-page");
const synced = (page: Page) => expect(page.getByTestId("sync-status")).toHaveAttribute("data-state", "synced");

/** Import through the visible file picker and wait for the results dialog. */
async function importFile(page: Page, path: string) {
  await page.getByTestId("import-file").setInputFiles(path);
}

/** Random bytes generated here, so no binary fixture (with control bytes) lives in the repo. */
async function importGarbage(page: Page) {
  const buffer = Buffer.from(Array.from({ length: 64 }, (_, i) => (i * 37 + 3) % 256));
  await page.getByTestId("import-file").setInputFiles({ name: "notes.bin", mimeType: "application/octet-stream", buffer });
}

async function exportAs(page: Page, id: string) {
  await page.getByTestId("export-button").click();
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByTestId(`export-${id}`).click()]);
  return download;
}

async function readDownload(d: Awaited<ReturnType<typeof exportAs>>): Promise<string> {
  const p = await d.path();
  return readFileSync(p, "utf8");
}

test("import and export, end to end", async ({ page }) => {
  page.on("pageerror", e => console.log("[pageerror]", e.message));

  // sign in, project
  await page.goto("/");
  await page.getByLabel("Dev login (email, no password)").fill(email);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.getByLabel("New project name").fill("Imports");
  await page.getByRole("button", { name: "Create project" }).click();
  await expect(page.getByRole("heading", { name: "Documents" })).toBeVisible();
  const projectUrl = page.url();

  // --- import Fountain
  await importFile(page, fx("rain-check.fountain"));
  const results = page.getByTestId("import-results");
  await expect(results).toBeVisible();
  await expect(page.getByTestId("import-format")).toHaveText("fountain");
  await expect(page.getByTestId("import-title")).toHaveText("Rain Check");
  await expect(page.getByTestId("conversion-report")).toBeVisible();
  await expect(page.getByTestId("report-summary")).toContainText("lost");
  await page.screenshot({ path: `${SHOTS}/formats-g2b-import-results.png` });

  // "Stay here": the document is in the list
  await page.getByTestId("import-stay").click();
  await expect(results).toBeHidden();
  await expect(page.getByTestId("document-row").filter({ hasText: "Rain Check" })).toHaveCount(1);

  // --- import FDX (drag and drop path: dispatch a real drop event with the file)
  const fdxBytes = readFileSync(fx("lab.fdx")).toString("base64");
  await page.evaluate(b64 => {
    const bin = atob(b64);
    const bytes = Uint8Array.from(bin, c => c.charCodeAt(0));
    const dt = new DataTransfer();
    dt.items.add(new File([bytes], "lab.fdx", { type: "application/xml" }));
    const zone = document.querySelector('[data-testid="import-dropzone"]')!;
    zone.dispatchEvent(new DragEvent("dragover", { dataTransfer: dt, bubbles: true, cancelable: true }));
    zone.dispatchEvent(new DragEvent("drop", { dataTransfer: dt, bubbles: true, cancelable: true }));
  }, fdxBytes);
  await expect(results).toBeVisible();
  await expect(page.getByTestId("import-format")).toHaveText("fdx");
  await expect(page.getByTestId("conversion-report")).toBeVisible();
  await page.getByTestId("import-open").click();

  // --- the FDX document opens with element text and styles
  await expect(page).toHaveURL(/\/d\/doc_/);
  await expect(page.getByTestId("script-editor")).toBeVisible();
  await synced(page);
  await expect(editorText(page)).toContainText("Dust floats in the light.");
  await expect(editorText(page)).toContainText("It should not be running.");
  const styles = await page.locator(".wui-el").evaluateAll(els => els.map(e => ({ role: (e as HTMLElement).dataset.role, text: e.textContent ?? "" })));
  const roleOf = (t: string) => styles.find(s => s.text.toLowerCase().includes(t.toLowerCase()))?.role;
  expect(roleOf("INT. LAB - DAY")).toBe("sceneHeading");
  expect(roleOf("DR. VOSS")).toBe("character");
  expect(roleOf("(checking a dial)")).toBe("parenthetical");
  expect(roleOf("It should not be running.")).toBe("dialogue");
  expect(roleOf("SMASH CUT TO:")).toBe("transition");

  // --- back to the project; open the Fountain document
  await page.goto(projectUrl);
  await page.getByRole("link", { name: "Rain Check" }).click();
  await expect(page.getByTestId("script-editor")).toBeVisible();
  await synced(page);
  await expect(editorText(page)).toContainText("We close in ten minutes.");
  const fStyles = await page.locator(".wui-el").evaluateAll(els => els.map(e => ({ role: (e as HTMLElement).dataset.role, text: e.textContent ?? "" })));
  const fRole = (t: string) => fStyles.find(s => s.text.toLowerCase().includes(t.toLowerCase()))?.role;
  expect(fRole("INT. DINER - NIGHT")).toBe("sceneHeading");
  expect(fRole("We close in ten minutes.")).toBe("dialogue");
  expect(fRole("CUT TO:")).toBe("transition");

  // --- type, then export Fountain immediately: the typed text is in the file
  await page.locator(".wui-el").last().click();
  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Zebra typed a moment ago", { delay: 10 });
  await expect(editorText(page)).toContainText("Zebra typed a moment ago");
  await page.getByTestId("export-button").click();
  await expect(page.getByTestId("export-menu")).toBeVisible();
  await expect(page.getByTestId("export-fountain")).toBeVisible();
  await expect(page.getByTestId("export-fdx")).toBeVisible();
  await expect(page.getByTestId("export-json")).toContainText("Backup");
  await expect(page.getByTestId("export-pdf")).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/formats-g2b-export-menu.png` });
  const [dl] = await Promise.all([page.waitForEvent("download"), page.getByTestId("export-fountain").click()]);
  expect(dl.suggestedFilename()).toMatch(/\.fountain$/);
  const fountain = await readDownload(dl);
  expect(fountain).toContain("Zebra typed a moment ago");
  expect(fountain).toContain("We close in ten minutes.");

  // --- FDX and JSON
  const fdxDl = await exportAs(page, "fdx");
  expect(fdxDl.suggestedFilename()).toMatch(/\.fdx$/);
  const fdx = await readDownload(fdxDl);
  expect(fdx.length).toBeGreaterThan(200);
  expect(fdx).toContain("FinalDraft");
  expect(fdx).toContain("Zebra typed a moment ago");
  const jsonDl = await exportAs(page, "json");
  expect(jsonDl.suggestedFilename()).toMatch(/\.json$/);
  const json = await readDownload(jsonDl);
  expect(json.length).toBeGreaterThan(200);
  expect(() => JSON.parse(json)).not.toThrow();

  // --- PDF (print) entry switches to Pages view
  await page.evaluate(() => { window.print = () => { (window as unknown as { __printed: boolean }).__printed = true; }; });
  await page.getByTestId("export-button").click();
  await page.getByTestId("export-pdf").click();
  await expect(page.getByTestId("view-pages")).toHaveAttribute("aria-selected", "true");
  await expect.poll(() => page.evaluate(() => (window as unknown as { __printed?: boolean }).__printed === true), { timeout: 30_000 }).toBe(true);

  // --- garbage file: a clear error, no document
  await page.goto(projectUrl);
  await expect(page.getByTestId("document-row")).toHaveCount(2);
  await importGarbage(page);
  const err = page.getByTestId("import-error");
  await expect(err).toBeVisible();
  await expect(err).toHaveAttribute("data-code", "UNSUPPORTED_FORMAT");
  await expect(err).toContainText("not a format Fadewright can import");
  await expect(page.getByTestId("document-row")).toHaveCount(2);
});
