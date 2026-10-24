/**
 * SEO injection middleware (Cloudflare Pages Function).
 *
 * The implementation lives in @sudobility/seo_lib/middleware: snapshot
 * injection into the live shell, trailing-slash canonicalization,
 * thin-fallback serving, and noindex tagging of bare-shell app-only routes.
 * App-specific URL normalization can be added via the `rewrite` option.
 */
import { createSeoMiddleware } from '@sudobility/seo_lib/middleware';

export const onRequest = createSeoMiddleware();
