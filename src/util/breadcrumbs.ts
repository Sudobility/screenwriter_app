/**
 * Shared breadcrumb builders so every trail starts from the same root — Home / Dashboard / … — and the
 * hrefs stay consistent across pages. Pages pass their own (translated) labels; the hrefs are fixed by the
 * app's routes. `ScreenContainer` uses `routeBreadcrumbs` to give the simple content/home pages a default
 * trail so the whole app shows breadcrumbs, while the dashboard/project pages set richer trails themselves.
 */
import type { BreadcrumbItem } from "@sudobility/building_blocks";

export const homeCrumb = (lang: string, label = "Home"): BreadcrumbItem => ({ label, href: `/${lang}` });
export const dashboardCrumb = (lang: string, label = "Dashboard"): BreadcrumbItem => ({ label, href: `/${lang}/projects` });
export const projectsCrumb = (lang: string, label = "Projects"): BreadcrumbItem => ({ label, href: `/${lang}/projects` });

/** Label for each simple content route (the segment after the language prefix). */
const CONTENT_LABELS: Record<string, string> = {
  docs: "Docs",
  resources: "Resources",
  about: "About",
  contact: "Contact",
  privacy: "Privacy",
  terms: "Terms",
  login: "Log in",
};

/**
 * A default trail derived from the URL for the pages that don't set their own (home + the static content
 * pages). Returns `null` for routes that build their own trail (dashboard, project, 404), so those are
 * left untouched.
 */
export function routeBreadcrumbs(pathname: string, lang: string): BreadcrumbItem[] | null {
  const parts = pathname.split("/").filter(Boolean); // ["en", "about", ...]
  const seg = parts[1];
  if (!seg) return [{ label: "Home", current: true }]; // the home page
  const label = CONTENT_LABELS[seg];
  if (label) return [homeCrumb(lang), { label, current: true }];
  return null;
}
