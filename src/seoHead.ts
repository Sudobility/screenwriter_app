import { type SEOHeadConfig } from "@sudobility/seo_lib";
import { SUPPORTED_LANGUAGES } from "./config/languages";

const APP_NAME = (import.meta.env.VITE_APP_NAME as string) || "HyperInk";
const APP_DOMAIN = (import.meta.env.VITE_APP_DOMAIN as string) || "hyperink.app";

/**
 * App-level SEO config consumed by `@sudobility/seo_lib`'s `SEOHead`.
 *
 * A single root-level `<SEOHead>` (see `main.tsx`) renders the react-helmet-style
 * `<link rel="canonical">` + meta tags for the current route. `scripts/prerender.mjs`
 * waits for that canonical as its "page mounted" signal before snapshotting, and
 * `functions/_middleware.js` injects the snapshot into the live shell at request time.
 */
export const seoHeadConfig: SEOHeadConfig = {
  appName: APP_NAME,
  baseUrl: `https://${APP_DOMAIN}`,
  defaultOgImage: `https://${APP_DOMAIN}/logo.png`,
  supportedLanguages: SUPPORTED_LANGUAGES as unknown as string[],
  defaultLanguage: "en",
  applicationCategory: "BusinessApplication",
};
