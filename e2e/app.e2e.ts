import { expect, test, type Browser, type Page } from "@playwright/test";

const SHOTS = "/Users/johnhuang/projects/screenwriter_plans/.superpowers/sdd";
const email = `e2e-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;

const editor = (page: Page) => page.getByTestId("script-editor");
const text = (page: Page) => page.locator(".wui-page");

async function login(page: Page) {
  await page.goto("/");
  await page.getByLabel("Dev login (email, no password)").fill(email);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Projects" })).toBeVisible();
}

async function typeAtEnd(page: Page, s: string, newLine = false) {
  await page.locator(".wui-el").last().click();
  await page.keyboard.press("ControlOrMeta+End");
  if (newLine) await page.keyboard.press("Enter");
  await page.keyboard.type(s, { delay: 15 });
}

async function synced(page: Page) {
  await expect(page.getByTestId("sync-status")).toHaveAttribute("data-state", "synced");
}

test("dev login to snapshots, end to end", async ({ page, browser }: { page: Page; browser: Browser }) => {
  page.on("console", m => { if (process.env.E2E_DEBUG) console.log("[A]", m.type(), m.text()); });
  page.on("pageerror", e => console.log("[A pageerror]", e.message));
  // 1. dev login
  await login(page);

  // 2. create a project
  await page.getByLabel("New project name").fill("Feature film");
  await page.getByRole("button", { name: "Create project" }).click();
  await expect(page.getByRole("heading", { name: "Documents" })).toBeVisible();
  await page.getByRole("link", { name: "Projects", exact: true }).click();
  await expect(page.getByTestId("project-row")).toContainText("Feature film");
  await page.screenshot({ path: `${SHOTS}/frontend-f4-dashboard.png` });
  await page.getByRole("link", { name: "Feature film" }).click();

  // 3. create a screenplay document (default template)
  await expect(page.getByLabel("Template")).not.toHaveValue("");
  await page.getByLabel("Title", { exact: true }).fill("Night Train");
  await page.getByRole("button", { name: "Create document" }).click();
  await expect(page).toHaveURL(/\/d\/doc_/);
  const docUrl = page.url();
  await expect(editor(page)).toBeVisible();
  await synced(page);

  // 4. type
  await page.locator(".wui-el").first().click();
  await page.keyboard.type("Zebra crossing quietly", { delay: 15 });
  await expect(text(page)).toContainText("Zebra crossing quietly");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Second line of action", { delay: 15 });
  await expect(text(page)).toContainText("Second line of action");
  await synced(page);
  await page.screenshot({ path: `${SHOTS}/frontend-f4-editor.png` });

  // 5. reload: text persisted
  await page.waitForTimeout(1500); // let the debounced offline save and the acks land
  await page.reload();
  await expect(text(page)).toContainText("Zebra crossing quietly");
  await expect(text(page)).toContainText("Second line of action");
  await synced(page);

  // 6. a second browser context (empty IndexedDB) of the same user sees the text from the server, and live edits
  const ctxB = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const pageB = await ctxB.newPage();
  await login(pageB);
  await pageB.goto(docUrl);
  await expect(text(pageB)).toContainText("Zebra crossing quietly");
  await expect(text(pageB)).toContainText("Second line of action");
  await synced(pageB);
  await typeAtEnd(page, "Live edit from A", true);
  await expect(text(pageB)).toContainText("Live edit from A");
  await typeAtEnd(pageB, "Live edit from B", true);
  await expect(text(page)).toContainText("Live edit from B");

  // 7. save a snapshot, type more, open the snapshot
  await page.getByRole("button", { name: "Snapshots" }).click();
  await page.getByLabel("Snapshot name").fill("First draft");
  await page.getByLabel("Snapshot note").fill("before the rewrite");
  await page.getByRole("button", { name: "Save snapshot" }).click();
  const row = page.locator('[data-testid="snapshot-row"][data-snapshot-name="First draft"]');
  await expect(row).toBeVisible();
  await expect(row).toContainText("before the rewrite");
  await page.screenshot({ path: `${SHOTS}/frontend-f4-snapshots.png` });

  await typeAtEnd(page, "Rewrite that must vanish", true);
  await expect(text(page)).toContainText("Rewrite that must vanish");
  await expect(text(pageB)).toContainText("Rewrite that must vanish");
  await synced(page);

  await row.getByRole("button", { name: "Open" }).click();
  await row.getByRole("button", { name: "Replace content" }).click();
  await expect(page.getByTestId("rebased-banner")).toContainText("Document replaced by snapshot");
  await expect(text(page)).not.toContainText("Rewrite that must vanish");
  await expect(text(page)).toContainText("Live edit from B");
  // still editable and live after the rebase
  await typeAtEnd(page, "Typed after the rebase", true);
  await expect(text(page)).toContainText("Typed after the rebase");
  await synced(page);
  // the other context rebased too and receives the new edit
  await expect(text(pageB)).not.toContainText("Rewrite that must vanish", { timeout: 30_000 });
  await expect(text(pageB)).toContainText("Typed after the rebase", { timeout: 30_000 });
  await page.screenshot({ path: `${SHOTS}/frontend-f4-rebased.png` });

  // 8. fork the snapshot: new document opens with the snapshot content
  await page.getByRole("button", { name: "Snapshots" }).click().catch(() => {});
  if (!(await page.getByTestId("snapshots-panel").isVisible())) await page.getByRole("button", { name: "Snapshots" }).click();
  const row2 = page.locator('[data-testid="snapshot-row"][data-snapshot-name="First draft"]');
  await row2.getByRole("button", { name: "Fork" }).click();
  await page.getByLabel("Fork title").fill("Night Train - alt ending");
  await page.getByRole("button", { name: "Create fork" }).click();
  await expect(page).not.toHaveURL(docUrl);
  await expect(page).toHaveURL(/\/d\/doc_/);
  await expect(page.getByLabel("Document title")).toHaveValue("Night Train - alt ending");
  await expect(text(page)).toContainText("Zebra crossing quietly");
  await expect(text(page)).not.toContainText("Typed after the rebase");
  await synced(page);
  await typeAtEnd(page, "Fork edit", true);
  await expect(text(page)).toContainText("Fork edit");

  await ctxB.close();
});
