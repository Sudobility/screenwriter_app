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

/** The kind filter is `@sudobility/components`' Radix-backed `Select`, not a native `<select>` — its
 * options render in a portal as `role="option"`, so picking one is a click, not `.selectOption()`. */
async function pickKind(page: Page, label: string) {
  await page.getByTestId("entity-kind-filter").click();
  await page.getByRole("option", { name: label, exact: true }).click();
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

  await pickKind(page, "Character");
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
  await pickKind(page, "Location");
  await expect(page.getByTestId("entity-row").filter({ hasText: "ARCHIVE" })).toBeVisible();

  // A kind that is never harvested: only exists once created by hand. The "Add" form only appears
  // once a specific kind is picked (not "All kinds"), and always creates that kind.
  await pickKind(page, "Prop");
  await expect(page.getByText("No entities yet.")).toBeVisible();
  await page.getByLabel("New Prop name").fill("The ledger");
  await page.getByRole("button", { name: "Add Prop", exact: true }).click();
  await expect(page.getByTestId("entity-detail")).toBeVisible();
  await expect(page.getByTestId("entity-name")).toHaveValue("The ledger");
  await page.getByRole("button", { name: "Back to list" }).click();
  await expect(page.getByTestId("entity-row").filter({ hasText: "The ledger" })).toBeVisible();
});
