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

test("editor sidebar: hierarchical Catalog, entity master/detail, jump back to script, and a manual kind", async ({ page }) => {
  await login(page);
  await createDoc(page, "Catalog doc");
  await seedScene(page);

  // No standalone "Catalog" button/panel any more — it's always in the sidebar, alongside Script
  // Structure, inside one persistent `MasterDetailLayout` (fixed upstream in `mail_box_components` to
  // mount exactly one copy of each pane — was two, one CSS-hidden, which is what broke a live
  // `ScriptEditor` the first time this was tried; see that repo's `MasterDetailLayout.tsx`). The
  // initial harvest already ran (on mount, before this text existed); Refresh re-scans.
  await expect(page.getByTestId("editor-sidebar")).toBeVisible();
  const charGroup = page.locator('[data-testid="catalog-kind-group"][data-kind="character"]');
  const locationGroup = page.locator('[data-testid="catalog-kind-group"][data-kind="location"]');
  await page.getByRole("button", { name: "Refresh" }).click();
  await expect(charGroup.getByText("1", { exact: true })).toBeVisible();
  await expect(locationGroup.getByText("1", { exact: true })).toBeVisible();

  // Selecting an entity is a real master/detail selection: the sidebar stays visible, and the script
  // editor is replaced by that entity's detail.
  await charGroup.getByText("QUINN", { exact: true }).click();
  await expect(page.getByTestId("entity-detail")).toBeVisible();
  await expect(page.getByTestId("entity-name")).toHaveValue("QUINN");
  await expect(page.getByText("Character · 1 scene")).toBeVisible();

  // "Appears in" jumps back into the script and clears the selection, snapping the detail pane back
  // to the editor — the sidebar itself never left.
  await page.getByRole("button", { name: "Speaks" }).click();
  await expect(page.getByTestId("view-edit")).toHaveAttribute("aria-selected", "true");
  await expect(page.locator(".wui-el", { hasText: "QUINN" })).toBeVisible();
  await expect(page.getByTestId("editor-sidebar")).toBeVisible();
  await expect(page.getByTestId("script-editor")).toBeVisible();

  // A kind nothing ever harvests: only exists once created by hand, via "+ Add other kind".
  await expect(page.getByText("+ Add other kind")).toBeVisible();
  await page.getByText("+ Add other kind").click();
  await page.getByTestId("other-kind-select").click();
  await page.getByRole("option", { name: "Prop", exact: true }).click();
  await page.getByLabel("New entity name").fill("The ledger");
  await page.getByRole("button", { name: "Add", exact: true }).click();

  // Creating it selects it immediately (same as clicking an existing row).
  await expect(page.getByTestId("entity-detail")).toBeVisible();
  await expect(page.getByTestId("entity-name")).toHaveValue("The ledger");
  await expect(page.locator('[data-testid="catalog-kind-group"][data-kind="prop"]')).toBeVisible();
});
