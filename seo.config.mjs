/**
 * SEO configuration for HyperInk.
 *
 * Used by generate-seo-assets-v2.mjs from johnqh/workflows to produce
 * per-route localized index.html files, sitemap.xml, and robots.txt.
 */

const APP_NAME = process.env.VITE_APP_NAME || 'HyperInk';
const APP_DOMAIN = process.env.VITE_APP_DOMAIN || 'hyperink.app';

export default {
  supportedLanguages: ['en'],

  languageHreflangMap: {
    en: 'en',
  },

  primaryDomain: APP_DOMAIN,
  appName: APP_NAME,
  appDomain: APP_DOMAIN,
  // Canonical URLs have NO trailing slash (source of truth). v2 of the
  // generator defaults to trailing slashes, so this flag must be present to
  // match seo_lib's runtime canonical and functions/_middleware.js.
  trailingSlashUrls: false,
  robotsDisallowPaths: [],

  routes: [
    {
      key: 'landing',
      path: '',
      namespace: 'app',
      priority: '1.0',
      changefreq: 'weekly',
      indexable: true,
      meta: () => ({
        title: APP_NAME,
        description: APP_NAME,
        keywords: '',
      }),
    },
  ],
};
