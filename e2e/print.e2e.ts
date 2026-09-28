import { expect, test, type Page } from "@playwright/test";

/**
 * Printing / Export -> PDF. What is printed is the sheets on their own (`print-sheets`, under <body>), not the
 * screen's layout: that layout goes "mobile" below 768px and hides the script, and a printed page is narrower than
 * that as soon as the browser adds margins, which used to print blank pages.
 */
const newEmail = () => `e2e-print-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;

async function open(page: Page) {
  await page.goto("/en/login");
  await page.getByLabel("Dev login (email, no password)").fill(newEmail());
  await page.getByLabel("Password", { exact: true }).fill("x");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByLabel("New project name").fill("Print project");
  await page.getByRole("button", { name: "Create project" }).click();
  await page.getByLabel("Title", { exact: true }).fill("Print");
  await page.getByRole("button", { name: "Create document" }).click();
  await expect(page.getByTestId("script-editor")).toBeVisible();
  await page.evaluate(() => {
    const s = (window as any).__fadewright.session;
    const starter = s.model.elements()[0].id as string;
    const range = { anchor: { elementId: starter, offset: 0 }, head: { elementId: starter, offset: 0 } };
    s.execute([{ id: "text.replaceRange", params: { range, text: "INT. OFFICE - DAY" } }], { kind: "local-command" });
    for (let i = 0; i < 90; i++) s.execute([{ id: "element.insert", params: { style: "st_action", text: `Action line number ${i}.` } }], { kind: "local-command" });
  });
  await expect(page.getByTestId("page-count")).toHaveAttribute("data-status", "ready", { timeout: 30_000 });
}
const pagesOf = (pdf: Buffer) => (pdf.toString("latin1").match(/\/Type\s*\/Page[^s]/g) ?? []).length;
/** What paper would show at this width: the sheets, and nothing of the app. */
async function onPaper(page: Page, width: number) {
  await page.setViewportSize({ width, height: 1056 });
  await page.emulateMedia({ media: "print" });
  const sheet = page.getByTestId("print-sheets").locator(".wui-sheet").first();
  await expect(sheet).toBeVisible();
  await expect(sheet).toContainText("Action line number 3.");
  expect((await sheet.boundingBox())!.height).toBeGreaterThan(900);
  await expect(page.locator("#root")).toBeHidden();
  await expect(page.getByTestId("editor-sidebar")).toBeHidden();
  await page.emulateMedia({ media: null });
  await page.setViewportSize({ width: 1400, height: 900 });
}

test("Export -> PDF prints the script pages, also on a page narrower than the layout's breakpoint", async ({ page }) => {
  await open(page);
  await page.evaluate(() => {
    (window as any).__printed = 0;
    window.print = () => void (window as any).__printed++;
  });
  await page.getByRole("button", { name: "Export" }).click();
  await page.getByText("PDF (print)").click();
  await expect.poll(() => page.evaluate(() => (window as any).__printed)).toBe(1);

  // The sheets are up when the print dialog opens, and they are not on screen.
  const sheets = page.getByTestId("print-sheets");
  await expect(sheets.locator(".wui-sheet")).toHaveCount(await page.locator('[data-testid="editor-split"] .wui-sheet').count());
  await expect(sheets).toBeHidden();
  expect(await page.locator('[data-testid="editor-split"] .wui-sheet').count()).toBe(4);

  await onPaper(page, 816); // Letter, no margins
  await onPaper(page, 700); // the browser's own margins: below the 768px breakpoint, where it used to come out blank

  const pdf = await page.pdf({ format: "Letter", margin: { left: "0.5in", right: "0.5in", top: "0in", bottom: "0in" } });
  expect(pagesOf(pdf)).toBe(4);
  expect(pdf.length).toBeGreaterThan(8000);
});

test("the Pages view's Print button prints the sheets; nothing is kept around afterwards", async ({ page }) => {
  await open(page);
  await page.getByTestId("view-pages").click();
  await expect(page.getByTestId("print-sheets")).toHaveCount(0);
  await page.evaluate(() => {
    (window as any).__printed = 0;
    window.print = () => void (window as any).__printed++;
  });
  await page.getByTestId("print-button").click();
  await expect.poll(() => page.evaluate(() => (window as any).__printed)).toBe(1);
  await onPaper(page, 700);
  await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
  await expect(page.getByTestId("print-sheets")).toHaveCount(0);
  await expect(page.getByTestId("page-view")).toHaveCount(1);
});

test("the browser's own Print command prints the pages from the Edit view too", async ({ page }) => {
  await open(page);
  await expect(page.getByTestId("print-sheets")).toHaveCount(0); // not kept around while editing
  await page.evaluate(() => window.dispatchEvent(new Event("beforeprint")));
  await expect(page.getByTestId("print-sheets").locator(".wui-sheet")).not.toHaveCount(0);
  await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
  await expect(page.getByTestId("print-sheets")).toHaveCount(0);
  // the editor is as it was
  await expect(page.getByTestId("script-editor")).toBeVisible();
});
