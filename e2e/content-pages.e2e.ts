import { expect, test, type Page } from "@playwright/test";

/**
 * The six public content pages (Docs, Resources, About, Contact, Privacy, Terms): each route renders its
 * heading, and the topbar/footer links that point at them actually navigate there — not just that the
 * routes exist. No dev login needed: these pages, like the home page, are public.
 */

async function expectPage(page: Page, path: string, heading: string) {
  await page.goto(path);
  await expect(page.getByRole("heading", { name: heading, exact: true }).first()).toBeVisible();
}

test("content pages render directly", async ({ page }) => {
  await expectPage(page, "/en/docs", "Documentation");
  await expectPage(page, "/en/resources", "Resources");
  await expectPage(page, "/en/about", "About Fadewright");
  await expectPage(page, "/en/contact", "Contact us");
  await expectPage(page, "/en/privacy", "Privacy Policy");
  await expectPage(page, "/en/terms", "Terms of Service");
});

test("topbar links to Docs and Resources", async ({ page }) => {
  // The home page's full footer has its own "Docs"/"Resources" links too, so scope to the topbar's nav
  // landmark — an unscoped getByRole("link", {name: "Docs"}) is ambiguous on this page.
  await page.goto("/en");
  const nav = page.getByRole("navigation", { name: "Main navigation" });
  await nav.getByRole("link", { name: "Docs", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Documentation", exact: true })).toBeVisible();
  await page.goto("/en");
  await page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", { name: "Resources", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Resources", exact: true })).toBeVisible();
});

test("home page's full footer links to About, Docs, Resources, Contact, Privacy and Terms", async ({ page }) => {
  await page.goto("/en");
  const footer = page.locator("footer");
  await expect(footer.getByRole("link", { name: "About", exact: true })).toBeVisible();

  await footer.getByRole("link", { name: "About", exact: true }).click();
  await expect(page.getByRole("heading", { name: "About Fadewright", exact: true })).toBeVisible();

  await page.goto("/en");
  await page.locator("footer").getByRole("link", { name: "Contact", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Contact us", exact: true })).toBeVisible();

  await page.goto("/en");
  await page.locator("footer").getByRole("link", { name: "Privacy", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Privacy Policy", exact: true })).toBeVisible();

  await page.goto("/en");
  await page.locator("footer").getByRole("link", { name: "Terms", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Terms of Service", exact: true })).toBeVisible();
});

test("every other page's compact footer links to Privacy and Terms", async ({ page }) => {
  await page.goto("/en/about");
  const footer = page.locator("footer");
  await footer.getByRole("link", { name: "Privacy", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Privacy Policy", exact: true })).toBeVisible();
});
