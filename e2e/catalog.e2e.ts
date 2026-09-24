import { expect, test, type Page } from "@playwright/test";

const email = `e2e-catalog-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;

const synced = (page: Page) => expect(page.getByTestId("sync-status")).toHaveAttribute("data-state", "synced");

async function login(page: Page) {
  await page.goto("/en/login");
  await page.getByLabel("Dev login (email, no password)").fill(email);
  await page.getByLabel("Password", { exact: true }).fill("x");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Projects" })).toBeVisible();
}

async function createDoc(page: Page, title: string) {
  await page.getByLabel("New project name").fill("Catalog project");
  await page.getByRole("button", { name: "Create project" }).click();
  await expect(page.getByRole("heading", { name: "Documents" })).toBeVisible();
  await page.getByLabel("Title", { exact: true }).fill(title);
  await page.getByRole("button", { name: "Create document" }).click();
  await expect(page).toHaveURL(/\/d\/doc_/);
  await expect(page.getByTestId("script-editor")).toBeVisible();
  await synced(page);
}

/** Scene heading + character + dialogue, through the same command path the editor uses (matches
 * `columns.e2e.ts`'s `seed()`), so the entity harvester has real text to find. */
async function seedScene(page: Page) {
  await page.evaluate(() => {
    const s = (window as any).__fadewright.session;
    const starter = s.model.elements()[0].id as string;
    s.execute([{ id: "element.setStyle", params: { elements: [starter], style: "st_dialogue" } }], { kind: "local-command" });
    s.execute([{ id: "element.insert", params: { before: starter, style: "st_scene_heading", text: "int. archive - night" } }], { kind: "local-command" });
    s.execute([{ id: "element.insert", params: { before: starter, style: "st_character", text: "quinn" } }], { kind: "local-command" });
    s.execute([{ id: "element.insert", params: { before: starter, style: "st_dialogue", text: "It's all still here." } }], { kind: "local-command" });
  });
  await expect(page.getByTestId("page-count")).toHaveAttribute("data-status", "ready", { timeout: 30_000 });
}

test("catalog panel: harvested character/location, jump to scene, and a manual prop", async ({ page }) => {
  await login(page);
  await createDoc(page, "Catalog doc");
  await seedScene(page);

  await page.getByTestId("catalog-button").click();
  await expect(page.getByTestId("catalog-panel")).toBeVisible();

  // Harvesting runs once automatically on open; "Refresh" re-confirms it's idempotent to press by hand too.
  await page.getByRole("button", { name: "Refresh" }).click();

  await page.getByLabel("Kind", { exact: true }).selectOption({ label: "Character" });
  const quinn = page.getByTestId("entity-row").filter({ hasText: "QUINN" });
  await expect(quinn).toBeVisible();
  await quinn.click();
  await expect(page.getByTestId("entity-detail")).toBeVisible();
  await expect(page.getByTestId("entity-name")).toHaveValue("QUINN");

  // Jump to where it appears: back to the Edit view, caret at the character cue. The panel itself
  // stays open (jumping only changes the Edit/Pages/Cards view), still showing QUINN's detail.
  await page.getByRole("button", { name: "Speaks" }).first().click();
  await expect(page.getByTestId("view-edit")).toHaveAttribute("aria-selected", "true");
  await expect(page.locator(".wui-el", { hasText: "QUINN" })).toBeVisible();
  await expect(page.getByTestId("catalog-panel")).toBeVisible();

  // Locations are harvested too.
  await page.getByRole("button", { name: "Back to list" }).click();
  await page.getByLabel("Kind", { exact: true }).selectOption({ label: "Location" });
  await expect(page.getByTestId("entity-row").filter({ hasText: "ARCHIVE" })).toBeVisible();

  // A kind that is never harvested: only exists once created by hand.
  await page.getByLabel("Kind", { exact: true }).selectOption({ label: "Prop" });
  await expect(page.getByText("No entities yet.")).toBeVisible();
  await page.getByLabel("New entity kind").selectOption({ label: "Prop" });
  await page.getByLabel("New entity name").fill("The ledger");
  await page.getByTestId("entity-add").click();
  await expect(page.getByTestId("entity-detail")).toBeVisible();
  await expect(page.getByTestId("entity-name")).toHaveValue("The ledger");
  await page.getByRole("button", { name: "Back to list" }).click();
  await expect(page.getByTestId("entity-row").filter({ hasText: "The ledger" })).toBeVisible();
});
