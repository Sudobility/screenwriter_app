import { expect, test, type Page } from "@playwright/test";

/**
 * The sidebar and the Catalog beyond the basics: a menu that opens upward when it is at the bottom of the window,
 * collapsible sections, Notes, and printing what was written as paragraphs.
 */
const newEmail = () => `e2e-extras-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;

async function open(page: Page, title: string) {
  await page.goto("/en/login");
  await page.getByLabel("Dev login (email, no password)").fill(newEmail());
  await page.getByLabel("Password", { exact: true }).fill("x");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByLabel("New project name").fill("Extras project");
  await page.getByRole("button", { name: "Create project" }).click();
  await page.getByLabel("Title", { exact: true }).fill(title);
  await page.getByRole("button", { name: "Create document" }).click();
  await expect(page.getByTestId("script-editor")).toBeVisible();
  await expect(page.getByTestId("sync-status")).toHaveAttribute("data-state", "synced");
}

test("the Kind menu stays within the window and every option is reachable, tall or short", async ({ page }) => {
  // The Kind picker (`other-kind-select`) now lives under the rail's "+ More" item, near the top of its list rather
  // than at the bottom of a long tree. The invariant the upstream `Select` must still honour (see vite.config's
  // `@sudobility/components/select` alias): the menu never runs off the window and every option can be reached by
  // scrolling inside it — whichever side it opens on for the room available.
  await open(page, "Menus");
  const measure = async (height: number) => {
    await page.setViewportSize({ width: 1400, height });
    await page.getByTestId("rail-more").click();
    const add = page.getByText("+ Add other kind");
    if (await add.count()) await add.click();
    const trigger = page.getByTestId("other-kind-select");
    await trigger.scrollIntoViewIfNeeded();
    await trigger.click();
    const menu = page.getByRole("listbox");
    await expect(menu).toBeVisible();
    await page.waitForTimeout(300); // the opening animation
    const t = (await trigger.boundingBox())!;
    const m = (await menu.boundingBox())!;
    const side = await menu.getAttribute("data-side");
    // every option can be reached: the list scrolls inside the menu
    await page.keyboard.press("End");
    await expect(page.getByRole("option", { name: "Misc", exact: true })).toBeInViewport();
    await page.keyboard.press("Escape");
    return { side, top: m.y, bottom: m.y + m.height, trigger: { top: t.y, bottom: t.y + t.height }, height };
  };

  for (const height of [900, 520]) {
    const r = await measure(height);
    // fully on screen, never running off either edge
    expect(r.top).toBeGreaterThanOrEqual(0);
    expect(r.bottom).toBeLessThanOrEqual(height);
    // and on the correct side of its trigger for whichever way it opened
    if (r.side === "bottom") expect(r.top).toBeGreaterThanOrEqual(r.trigger.top - 1);
    else expect(r.bottom).toBeLessThanOrEqual(r.trigger.bottom + 1);
  }
});

test("the sidebar's icon rail switches between sections", async ({ page }) => {
  await open(page, "Rail");
  const list = page.getByTestId("sidebar-list");
  // Scenes is the default section: the Navigator and the scene count.
  await expect(page.getByTestId("rail-scenes")).toHaveAttribute("data-active", "true");
  await expect(page.getByTestId("scenes-section")).toContainText("1 scene");
  await expect(list.getByTestId("navigator")).toBeVisible();

  // Characters: the Navigator is gone, the character list (its own header + Refresh) is shown instead.
  await page.getByTestId("rail-character").click();
  await expect(page.getByTestId("rail-character")).toHaveAttribute("data-active", "true");
  await expect(list.getByTestId("navigator")).toHaveCount(0);
  await expect(page.locator('[data-testid="catalog-kind-group"][data-kind="character"]')).toBeVisible();
  await expect(list.getByText("Refresh")).toBeVisible();

  // Back to Scenes.
  await page.getByTestId("rail-scenes").click();
  await expect(list.getByTestId("navigator")).toBeVisible();
  await expect(page.locator('[data-testid="catalog-kind-group"][data-kind="character"]')).toHaveCount(0);

  // the script is untouched by any of it
  await expect(page.getByTestId("script-editor")).toBeVisible();
});

test("Notes: add, write, print, delete", async ({ page }) => {
  await open(page, "The Door");
  await page.evaluate(() => {
    (window as any).__printed = [];
    window.print = () => {
      const doc = document.querySelector(".print-doc");
      (window as any).__printed.push({ text: doc?.textContent ?? null, cls: document.body.className, tags: doc ? [...doc.querySelectorAll("h1, h2, p")].map(n => n.tagName) : [] });
    };
  });
  const scriptLine = await page.locator(".wui-page .wui-el").first().evaluate(el => [getComputedStyle(el).fontFamily, getComputedStyle(el).fontSize]);
  await page.getByTestId("rail-notes").click();
  const notes = page.getByTestId("catalog-notes-group");
  await expect(notes).toContainText("Notes");
  await page.getByTestId("note-add").click();

  // The new note is selected, ready to be written.
  await expect(page.getByTestId("note-title")).toHaveValue("Note 1");
  await expect(notes).toContainText("Note 1");

  // Nothing written yet: nothing to print.
  await page.getByTestId("print-item").click();
  await expect(page.getByTestId("print-item-empty")).toBeVisible();
  expect(await page.evaluate(() => (window as any).__printed.length)).toBe(0);

  await page.getByTestId("note-title").fill("Research: lighthouses");
  await page.getByTestId("note-body").fill("Lamps burned colza oil.\n\nKeepers worked in pairs.");
  // straight from the text to the button: what was typed is saved on the way
  await page.getByTestId("print-item").click();
  await expect(page.getByTestId("print-item-empty")).toHaveCount(0);
  const printed = await page.evaluate(() => (window as any).__printed);
  expect(printed).toHaveLength(1);
  expect(printed[0].text).toBe("Research: lighthousesNote · The DoorLamps burned colza oil.Keepers worked in pairs.");
  expect(printed[0].tags).toEqual(["H1", "P", "P", "P"]);
  expect(printed[0].cls).toContain("printing-doc");
  await expect(notes).toContainText("Research: lighthouses");
  await expect(notes).toContainText("Lamps burned colza oil.");

  // On paper: the note alone, not the app, not the script.
  await page.emulateMedia({ media: "print" });
  await expect(page.getByTestId("print-doc")).toBeVisible();
  // In the script's font, all of it: the same family and size as a line of the script.
  const printedFonts = await page.getByTestId("print-doc").evaluate(doc => [doc, ...doc.querySelectorAll("*")].map(n => [getComputedStyle(n).fontFamily, getComputedStyle(n).fontSize].join(" | ")));
  expect(new Set(printedFonts)).toEqual(new Set([scriptLine.join(" | ")]));
  expect(scriptLine[0]).toContain("Courier Prime");
  await expect(page.locator("#root")).toBeHidden();
  await page.emulateMedia({ media: null });
  await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
  await expect(page.getByTestId("print-doc")).toHaveCount(0);
  await expect(page.locator("body")).not.toHaveClass(/printing-doc/);

  // It is kept with the script.
  await expect(page.getByTestId("sync-status")).toHaveAttribute("data-state", "synced");
  await page.reload();
  await expect(page.getByTestId("script-editor")).toBeVisible();
  await page.getByTestId("rail-notes").click();
  await page.getByTestId("catalog-notes-group").getByText("Research: lighthouses").click();
  await expect(page.getByTestId("note-body")).toHaveValue("Lamps burned colza oil.\n\nKeepers worked in pairs.");
  // A note is not a "Misc" item.
  await expect(page.locator('[data-testid="catalog-kind-group"][data-kind="misc"]')).toHaveCount(0);

  await page.getByTestId("note-delete").click();
  await page.getByTestId("note-delete-confirm").click();
  await expect(page.getByTestId("script-editor")).toBeVisible();
  await expect(page.getByTestId("catalog-notes-group")).not.toContainText("Research: lighthouses");
});

test("paragraphs elsewhere in the Catalog print too: a description, a synopsis; a one-line item has no Print", async ({ page }) => {
  await open(page, "Printing");
  await page.evaluate(() => {
    (window as any).__printed = [];
    window.print = () => void (window as any).__printed.push(document.querySelector(".print-doc")?.textContent ?? null);
  });
  await page.getByTestId("rail-story").click();
  await page.getByText("Theme", { exact: true }).click();
  await expect(page.getByTestId("story-field-theme")).toBeVisible();
  await expect(page.getByTestId("print-item")).toHaveCount(0);
  await page.getByText("Synopsis", { exact: true }).click();
  await page.getByTestId("story-field-synopsis").fill("A keeper finds a door in the rock.");
  await page.getByTestId("print-item").click();

  await page.getByTestId("rail-location").click();
  await page.locator('[data-testid="catalog-kind-group"][data-kind="location"]').getByTitle("Add Location").click();
  await page.getByLabel("New Location name").fill("Lighthouse");
  await page.getByTestId("entity-add").click();
  await page.getByTestId("entity-description").fill("White tower on a black rock.");
  await page.getByTestId("print-item").click();
  expect(await page.evaluate(() => (window as any).__printed)).toEqual([
    "SynopsisStory · PrintingA keeper finds a door in the rock.",
    "LighthouseLocation · PrintingDescriptionWhite tower on a black rock.",
  ]);
});
