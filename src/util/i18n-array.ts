import type { TFunction } from "i18next";

/**
 * `t(key, { returnObjects: true })` as a string array, safe against i18next's async backend: on a cold
 * load, `t()` can return the raw key (a string) before `/locales/en/app.json` has finished fetching, and
 * calling `.map()` on that crashes the page (`items.map is not a function`) — found via `content-pages.e2e.ts`
 * hitting screenwriter_app's `ErrorBoundary` on a fresh `/en/contact` navigation. Falls back to `[]` for that
 * one render; the real re-render right after (once translations are loaded) fixes it up, no flash of broken
 * UI, only briefly none.
 */
export function translatedArray(t: TFunction, key: string): string[] {
  const v = t(key, { returnObjects: true });
  return Array.isArray(v) ? (v as string[]) : [];
}
