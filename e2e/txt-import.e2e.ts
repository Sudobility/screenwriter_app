import { expect, test, type Page } from "@playwright/test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const fx = (n: string) => join(HERE, "fixtures", n);
const email = `e2e-txt-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;

const editorText = (page: Page) => page.locator(".wui-page");
const synced = (page: Page) => expect(page.getByTestId("sync-status")).toHaveAttribute("data-state", "synced");

/**
 * Smart .txt import: a loosely formatted plain-text screenplay (no Fountain markup, wrapped action and
 * dialogue) is detected element-by-element and its wrapped lines are reflowed into single paragraphs.
 */
test("smart .txt import detects elements and reflows wrapped lines", async ({ page }) => {
  page.on("pageerror", e => console.log("[pageerror]", e.message));

  await page.goto("/en/login");
  await page.getByLabel("Dev login (email, no password)").fill(email);
  await page.getByLabel("Password", { exact: true }).fill("x");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByLabel("New project name").fill("Txt Import");
  await page.getByRole("button", { name: "Create project" }).click();
  await expect(page.getByRole("heading", { name: "Documents" })).toBeVisible();

  await page.getByTestId("import-file").setInputFiles(fx("loose-draft.txt"));

  const results = page.getByText("Import results");
  await expect(results).toBeVisible();
  await expect(page.getByTestId("import-format")).toHaveText("txt");
  await page.getByRole("button", { name: "Open document" }).click();

  await expect(page).toHaveURL(/\/d\/doc_/);
  await expect(page.getByTestId("script-editor")).toBeVisible();
  await synced(page);

  // Wrapped action and dialogue were reflowed into one paragraph each (newlines removed).
  await expect(editorText(page)).toContainText("Rows of seedlings stretch toward the glass roof. Dr. Okafor walks the aisle with a clipboard, pausing at a tray that should be empty but is not.");
  await expect(editorText(page)).toContainText("These germinated overnight. That is not supposed to be possible.");

  const els = await page.locator(".wui-el").evaluateAll(list => list.map(e => ({ role: (e as HTMLElement).dataset.role, text: (e.textContent ?? "").trim() })));
  // Exact match: "Dr. Okafor" also appears inside the action paragraph, so a substring lookup would collide.
  const roleOf = (t: string) => els.find(s => s.text === t)?.role;
  expect(roleOf("INT. GREENHOUSE - DAY")).toBe("sceneHeading");
  expect(roleOf("DR. OKAFOR")).toBe("character");
  expect(roleOf("ASSISTANT")).toBe("character");
  expect(roleOf("These germinated overnight. That is not supposed to be possible.")).toBe("dialogue");
  expect(roleOf("CUT TO:")).toBe("transition");
  expect(roleOf("FADE OUT.")).toBe("transition");
  // two scene headings detected
  expect(els.filter(e => e.role === "sceneHeading")).toHaveLength(2);
});
