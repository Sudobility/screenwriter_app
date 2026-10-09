import { expect, test, type Page } from "@playwright/test";

const email = `e2e-catalog-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;

const synced = (page: Page) => expect(page.getByTestId("sync-status")).toHaveAttribute("data-state", "synced");

async function login(page: Page) {
  await page.goto("/en/login");
  await page.getByLabel("Dev login (email, no password)").fill(email);
  await page.getByLabel("Password", { exact: true }).fill("x");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Projects", level: 1 })).toBeVisible();
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

  // The editing bar (style picker etc.) only makes sense with the script editor on screen.
  await expect(page.getByTestId("editing-bar")).toHaveAttribute("data-script-active", "true");

  // Selecting an entity is a real master/detail selection: the sidebar stays visible, and the script
  // editor is replaced by that entity's detail.
  await charGroup.getByText("QUINN", { exact: true }).click();
  await expect(page.getByTestId("entity-detail")).toBeVisible();
  await expect(page.getByTestId("entity-name")).toHaveValue("QUINN");
  await expect(page.getByText("Character · 1 scene")).toBeVisible();
  await expect(page.getByTestId("editing-bar")).toHaveAttribute("data-script-active", "false"); // script tools grey out: no script editor to act on
  await expect(page.getByTestId("title-button")).toBeEnabled(); // panel buttons keep working

  // "Appears in" jumps back into the script and clears the selection, snapping the detail pane back
  // to the editor — the sidebar itself never left.
  await page.getByRole("button", { name: "Speaks" }).click();
  await expect(page.getByTestId("view-edit")).toHaveAttribute("aria-selected", "true");
  await expect(page.locator(".wui-el", { hasText: "QUINN" })).toBeVisible();
  await expect(page.getByTestId("editor-sidebar")).toBeVisible();
  await expect(page.getByTestId("script-editor")).toBeVisible();
  await expect(page.getByTestId("editing-bar")).toBeVisible();

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
  // Aliases are Character-only, not a generic thing every kind gets.
  await expect(page.getByText("Aliases", { exact: true })).toHaveCount(0);
});

test("character skeleton: structured fields, optional-field picker, and life stages by age", async ({ page }) => {
  await login(page);
  await createDoc(page, "Skeleton doc");
  await seedScene(page);

  const charGroup = page.locator('[data-testid="catalog-kind-group"][data-kind="character"]');
  await page.getByRole("button", { name: "Refresh" }).click();
  await charGroup.getByText("QUINN", { exact: true }).click();
  await expect(page.getByTestId("entity-detail")).toBeVisible();

  // Aliases live inside the skeleton's own Social section, not a separate area above it.
  const social = page.locator('[data-testid="skeleton-section"][data-section="social"]');
  await expect(social.getByText("Aliases", { exact: true })).toBeVisible();
  await social.getByLabel("New alias").fill("Q");
  await social.getByRole("button", { name: "Add", exact: true }).click();
  await expect(social.getByText("Q", { exact: true })).toBeVisible();

  // Only Age (required) shows at first; every other field is added on demand, per section, one click
  // each ("+ Race" reveals the field directly — no menu to open first).
  const physical = page.locator('[data-testid="skeleton-section"][data-section="physical"]');
  await expect(physical.getByTestId("skeleton-field-age")).toBeVisible();
  await expect(physical.getByTestId("skeleton-remove-age")).toHaveCount(0); // Age can't be removed
  await expect(physical.getByTestId("skeleton-field-race")).toHaveCount(0);
  await physical.getByTestId("skeleton-field-age").fill("50");
  await physical.getByTestId("skeleton-field-age").press("Tab");
  await physical.getByTestId("skeleton-add-field-race").click();
  await physical.getByTestId("skeleton-field-race").fill("Human");
  await physical.getByTestId("skeleton-field-race").press("Tab");

  // A non-required field can be removed again: clears the stored value and hides the input.
  await physical.getByTestId("skeleton-add-field-height").click();
  await physical.getByTestId("skeleton-field-height").fill("6'0\"");
  await physical.getByTestId("skeleton-remove-height").click();
  await expect(physical.getByTestId("skeleton-field-height")).toHaveCount(0);
  await physical.getByTestId("skeleton-add-field-height").click();
  await expect(physical.getByTestId("skeleton-field-height")).toHaveValue("");

  // "+ Add Age": the un-staged skeleton (age 50, race Human) becomes stage 1, a blank "New" stage is
  // added, selected automatically, and the character becomes a branch in the sidebar tree.
  await page.getByTestId("add-age").click();
  await expect(page.getByTestId("stage-heading")).toHaveText("QUINN · Age New");
  await expect(charGroup.getByText("50", { exact: true })).toBeVisible();
  await expect(charGroup.getByText("New", { exact: true })).toBeVisible();

  // Fill the new stage's age: the sidebar's "New" label updates live to the entered age.
  const newPhysical = page.locator('[data-testid="skeleton-section"][data-section="physical"]');
  await newPhysical.getByTestId("skeleton-field-age").fill("60");
  await newPhysical.getByTestId("skeleton-field-age").press("Tab");
  await expect(charGroup.getByText("60", { exact: true })).toBeVisible();
  await expect(charGroup.getByText("New", { exact: true })).toHaveCount(0);

  // The earlier stage (50) kept its own fields (race), independent of the new one.
  await charGroup.getByText("50", { exact: true }).click();
  await expect(page.getByTestId("stage-heading")).toHaveText("QUINN · Age 50");
  await expect(physical.getByTestId("skeleton-field-race")).toHaveValue("Human");
  // Aliases are character-level, not per-stage — a stage's own Social section doesn't show them.
  await expect(page.locator('[data-testid="skeleton-section"][data-section="social"]').getByText("Aliases", { exact: true })).toHaveCount(0);

  // Back to the character itself: it now lists its life stages instead of a single skeleton, with
  // Aliases as its own section again (it's no longer inside a Social section — no skeleton is shown).
  await page.getByText("← QUINN").click();
  await expect(page.getByTestId("life-stages")).toBeVisible();
  await expect(page.getByTestId("life-stages").getByText("50", { exact: true })).toBeVisible();
  await expect(page.getByTestId("life-stages").getByText("60", { exact: true })).toBeVisible();
  await expect(page.getByText("Aliases", { exact: true })).toBeVisible();
  await expect(page.getByText("Q", { exact: true })).toBeVisible();

  // Deleting a stage needs the inline confirm, and removes just that one node from the tree.
  await page.getByTestId("life-stages").getByText("60", { exact: true }).click();
  await page.getByRole("button", { name: "Delete this stage", exact: true }).click();
  await page.getByRole("button", { name: "Delete stage", exact: true }).click();
  await expect(charGroup.getByText("60", { exact: true })).toHaveCount(0);
  await expect(charGroup.getByText("50", { exact: true })).toBeVisible();
});

test("location: Interior/Exterior setting, no Aliases", async ({ page }) => {
  await login(page);
  await createDoc(page, "Location doc");
  await seedScene(page);

  await page.getByRole("button", { name: "Refresh" }).click();
  const locationGroup = page.locator('[data-testid="catalog-kind-group"][data-kind="location"]');
  await locationGroup.getByText("archive", { exact: true }).click();
  await expect(page.getByTestId("entity-detail")).toBeVisible();
  await expect(page.getByTestId("entity-name")).toHaveValue("archive");

  // No Aliases for locations.
  await expect(page.getByText("Aliases", { exact: true })).toHaveCount(0);

  // Interior/Exterior: clicking one selects it, clicking it again clears back to unset.
  const int = page.getByTestId("location-setting-int");
  const ext = page.getByTestId("location-setting-ext");
  await expect(int).toHaveAttribute("aria-pressed", "false");
  await expect(ext).toHaveAttribute("aria-pressed", "false");
  await int.click();
  await expect(int).toHaveAttribute("aria-pressed", "true");
  await ext.click();
  await expect(int).toHaveAttribute("aria-pressed", "false");
  await expect(ext).toHaveAttribute("aria-pressed", "true");
  await ext.click();
  await expect(ext).toHaveAttribute("aria-pressed", "false");
});

test("Catalog: built-in Story items (Plot with a main plot and subplots, Theme, Tagline, Synopsis)", async ({ page }) => {
  await login(page);
  await createDoc(page, "Story doc");

  await page.getByText("Story", { exact: true }).click();
  await page.getByText("Theme", { exact: true }).click();
  await expect(page.getByTestId("entity-detail")).toBeVisible();
  await page.getByTestId("story-field-theme").fill("Redemption");
  await page.getByTestId("story-field-theme").press("Tab");

  await page.getByText("Tagline", { exact: true }).click();
  await page.getByTestId("story-field-tagline").fill("Every ending is a beginning.");
  await page.getByTestId("story-field-tagline").press("Tab");

  await page.getByText("Synopsis", { exact: true }).click();
  await page.getByTestId("story-field-synopsis").fill("An archivist rediscovers a forgotten war.");
  await page.getByTestId("story-field-synopsis").press("Tab");

  // Plot: a main plot, plus 0..N subplots added from the branch's own "+".
  const storyGroup = page.locator('[data-testid="catalog-story-group"]');
  await storyGroup.getByText("Plot", { exact: true }).click();
  await expect(page.getByTestId("story-field-plot-main")).toBeVisible();
  await page.getByTestId("story-field-plot-main").fill("A hero loses everything, then rebuilds.");
  await page.getByTestId("story-field-plot-main").press("Tab");

  await storyGroup.locator('button[title="Add subplot"]').click();
  await expect(page.getByTestId("story-field-subplot-name")).toHaveValue("New subplot");
  await expect(storyGroup.getByText("New subplot", { exact: true })).toBeVisible();
  await page.getByTestId("story-field-subplot-name").fill("A quiet romance");
  await page.getByTestId("story-field-subplot-name").press("Tab");
  await expect(storyGroup.getByText("A quiet romance", { exact: true })).toBeVisible(); // sidebar label updates live
  await page.getByTestId("story-field-subplot-text").fill("Two archivists fall for each other.");
  await page.getByTestId("story-field-subplot-text").press("Tab");

  // Values persist across navigating away and back.
  await page.getByText("Theme", { exact: true }).click();
  await expect(page.getByTestId("story-field-theme")).toHaveValue("Redemption");
  await storyGroup.getByText("A quiet romance", { exact: true }).click();
  await expect(page.getByTestId("story-field-subplot-text")).toHaveValue("Two archivists fall for each other.");

  // Deleting a subplot needs the inline confirm, and removes just that one node.
  await page.getByRole("button", { name: "Delete this subplot", exact: true }).click();
  await page.getByRole("button", { name: "Delete subplot", exact: true }).click();
  await expect(storyGroup.getByText("A quiet romance", { exact: true })).toHaveCount(0);
  await expect(page.getByTestId("story-field-plot-main")).toHaveValue("A hero loses everything, then rebuilds.");
});
