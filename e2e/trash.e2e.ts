import { expect, test, type Page } from "@playwright/test";

/** "Trash" asks first, for documents and for projects: cancel keeps the item, confirming moves it to the trash, restore brings it back. */
const email = `e2e-trash-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;

async function login(page: Page) {
  await page.goto("/en/login");
  await page.getByLabel("Dev login (email, no password)").fill(email);
  await page.getByLabel("Password", { exact: true }).fill("x");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Projects" })).toBeVisible();
}

test("trashing a document and a project each ask for confirmation", async ({ page }) => {
  await login(page);
  await page.getByLabel("New project name").fill("Trash project");
  await page.getByRole("button", { name: "Create project" }).click();
  await expect(page.getByRole("heading", { name: "Documents" })).toBeVisible();
  await page.getByLabel("Title", { exact: true }).fill("Doomed doc");
  await page.getByRole("button", { name: "Create document" }).click();
  await expect(page).toHaveURL(/\/d\/doc_/);
  await page.goBack();
  await expect(page.getByRole("heading", { name: "Documents" })).toBeVisible();
  const row = page.getByTestId("document-row").filter({ hasText: "Doomed doc" });
  await expect(row).toHaveCount(1);

  // Cancel keeps it.
  await row.getByRole("button", { name: "Trash", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Move document to trash?");
  await expect(dialog).toContainText("Doomed doc");
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(row).toHaveCount(1);

  // Confirm moves it to the trash; restore brings it back.
  await row.getByRole("button", { name: "Trash", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Move to trash", exact: true }).click();
  await expect(row).toHaveCount(0);
  await page.getByRole("button", { name: "Show trash" }).click();
  await expect(page.getByRole("heading", { name: "Trashed documents" })).toBeVisible();
  await page.getByTestId("document-row").filter({ hasText: "Doomed doc" }).getByRole("button", { name: "Restore" }).click();
  await expect(page.getByTestId("document-row").filter({ hasText: "Doomed doc" })).toHaveCount(0);

  // The same for a project.
  await page.getByRole("link", { name: "Projects", exact: true }).click();
  const prow = page.getByTestId("project-row").filter({ hasText: "Trash project" });
  await expect(prow).toHaveCount(1);
  await prow.getByRole("button", { name: "Trash", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("Move project to trash?");
  await page.getByRole("dialog").getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(prow).toHaveCount(1);
  await prow.getByRole("button", { name: "Trash", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Move to trash", exact: true }).click();
  await expect(prow).toHaveCount(0);
});
