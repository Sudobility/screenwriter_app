import { expect, test, type Page } from "@playwright/test";

/**
 * The sign-in rule: a page that needs an account, reached signed out, opens the sign-in *modal* over itself and
 * stays at its own URL — no redirect to /login and no redirect back. Closing the modal leaves a signed-out notice
 * whose button opens it again; signing in renders the page in place.
 */
const email = `e2e-modal-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;

async function signInThroughModal(page: Page) {
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Dev login (email, no password)").fill(email);
  await dialog.getByLabel("Password", { exact: true }).fill("x");
  await dialog.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(dialog).toBeHidden();
}

test("a gated page signs in through the modal and stays put", async ({ page }) => {
  page.on("pageerror", e => console.log("[pageerror]", e.message));

  // projects, signed out: the modal opens over the page; the URL does not change
  await page.goto("/en/projects");
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page).toHaveURL(/\/en\/projects$/);

  // closing without signing in leaves the signed-out notice, and its button opens the modal again
  await page.getByRole("dialog").getByRole("button", { name: "Close" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(page.getByTestId("signed-out-notice")).toBeVisible();
  await expect(page).toHaveURL(/\/en\/projects$/);
  await page.getByRole("button", { name: "Sign in to continue", exact: true }).click();

  await signInThroughModal(page);
  await expect(page).toHaveURL(/\/en\/projects$/);
  await expect(page.getByLabel("New project name")).toBeVisible();

  // a deep link into the editor, signed out: same modal, same URL, the editor once signed in
  await page.getByLabel("New project name").fill("Modal gate");
  await page.getByRole("button", { name: "Create project" }).click();
  await expect(page.getByRole("heading", { name: "Documents" })).toBeVisible();
  await expect(page.getByLabel("Template")).not.toHaveText("Template");
  await page.getByLabel("Title", { exact: true }).fill("Gated");
  await page.getByRole("button", { name: "Create document" }).click();
  await expect(page).toHaveURL(/\/d\/doc_/);
  const docUrl = page.url();
  await expect(page.getByTestId("script-editor")).toBeVisible();

  // sign out (dev auth persists in localStorage) and come back by URL
  await page.evaluate(() => localStorage.removeItem("screenwriter.devEmail"));
  await page.goto(docUrl);
  await expect(page.getByTestId("signed-out-notice")).toBeVisible();
  await signInThroughModal(page);
  expect(page.url()).toBe(docUrl);
  await expect(page.getByTestId("script-editor")).toBeVisible();
});
