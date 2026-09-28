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

test("the Kind menu opens upward when it is at the bottom of the window, and never runs off it", async ({ page }) => {
  await open(page, "Menus");
  const measure = async (height: number) => {
    await page.setViewportSize({ width: 1400, height });
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

  const tall = await measure(900);
  expect(tall.side).toBe("bottom");
  expect(tall.top).toBeGreaterThanOrEqual(tall.trigger.bottom);
  expect(tall.bottom).toBeLessThanOrEqual(900);

  // a short window: the trigger is near the bottom, with more room above it than below
  const short = await measure(520);
  expect(short.side).toBe("top");
  expect(short.bottom).toBeLessThanOrEqual(short.trigger.top + 1);
  expect(short.top).toBeGreaterThanOrEqual(0);
});

test("the sidebar's sections fold away", async ({ page }) => {
  await open(page, "Folding");
  const structure = page.getByTestId("structure-section");
  await expect(structure).toContainText("1 scene");
  await expect(structure.getByTestId("navigator")).toBeVisible();
  await page.getByTestId("structure-toggle").click();
  await expect(page.getByTestId("structure-toggle")).toHaveAttribute("aria-expanded", "false");
  await expect(structure.getByTestId("navigator")).toHaveCount(0);
  await expect(structure).toContainText("1 scene"); // still says how much is folded away
  await page.getByTestId("structure-toggle").click();
  await expect(structure.getByTestId("navigator")).toBeVisible();

  const catalog = page.getByTestId("catalog-tree");
  await expect(catalog.getByText("Character", { exact: true })).toBeVisible();
  await page.getByTestId("catalog-toggle").click();
  await expect(catalog.getByText("Character", { exact: true })).toHaveCount(0);
  await expect(catalog.getByText("Refresh")).toBeVisible();
  await page.getByTestId("catalog-toggle").click();
  await expect(catalog.getByText("Character", { exact: true })).toBeVisible();
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
  await page.getByTestId("catalog-notes-group").getByText("Notes", { exact: true }).click();
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
  await page.getByText("Story", { exact: true }).click();
  await page.getByText("Theme", { exact: true }).click();
  await expect(page.getByTestId("story-field-theme")).toBeVisible();
  await expect(page.getByTestId("print-item")).toHaveCount(0);
  await page.getByText("Synopsis", { exact: true }).click();
  await page.getByTestId("story-field-synopsis").fill("A keeper finds a door in the rock.");
  await page.getByTestId("print-item").click();

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
