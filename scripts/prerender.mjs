#!/usr/bin/env node

/**
 * Prerender / SEO snapshot generator — run via `bun run generate`.
 *
 * Drives the RUNNING app with headless Chromium (Playwright), fully rendering
 * each sitemap URL (React + localized i18n + live API data), and writes a
 * committed content snapshot to `public/html/<route>/index.html`. At request
 * time, `functions/_middleware.js` injects each snapshot into the live
 * `index.html` shell, so the snapshots never carry build-specific asset hashes
 * (they stay valid across rebuilds) and are committed to git.
 *
 * Workflow:
 *   1. Have a valid `.env` (working VITE_API_URL) and start the app:  bun run dev
 *   2. bun run generate        # drives http://localhost:5143 by default
 *   3. commit the public/html/ snapshots
 *
 * Each snapshot captures only the route-specific <head> (react-helmet `data-rh`
 * tags + <title> + route JSON-LD excluding the global Organization, with robots
 * forced to index since the dev host would otherwise be flagged noindex) and
 * the rendered `#root` innerHTML — NOT the dev/bundle scripts.
 *
 * Env: GENERATE_ORIGIN (default http://localhost:5143), PRERENDER_CONCURRENCY
 *      (default 4), PRERENDER_TIMEOUT ms (default 30000), PRERENDER_LIMIT,
 *      PRERENDER_FILTER (comma substrings), PRERENDER_OUT (default public/html),
 *      PRERENDER_SITEMAP (default public/sitemap.xml).
 */

import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const ORIGIN = (process.env.GENERATE_ORIGIN || 'http://localhost:5143').replace(/\/+$/, '');
const OUT_DIR = path.resolve(process.env.PRERENDER_OUT || 'public/html');
const SITEMAP = path.resolve(process.env.PRERENDER_SITEMAP || 'public/sitemap.xml');
const CONCURRENCY = Number(process.env.PRERENDER_CONCURRENCY || 4);
const NAV_TIMEOUT = Number(process.env.PRERENDER_TIMEOUT || 30000);
const LIMIT = process.env.PRERENDER_LIMIT ? Number(process.env.PRERENDER_LIMIT) : Infinity;
const FILTER = (process.env.PRERENDER_FILTER || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);
const PRERENDER_FLAG = '__SCREENWRITER_APP_PRERENDER__';
const HEAD_MARKER = '<!--PRERENDER-HEAD-->';
const BODY_MARKER = '<!--PRERENDER-BODY-->';

// Telemetry hosts that long-poll and prevent `networkidle`. API/auth/locales pass.
const BLOCKED_HOST_FRAGMENTS = [
  'google-analytics.com',
  'analytics.google.com',
  'googletagmanager.com',
  'doubleclick.net',
  'firebaseinstallations.googleapis.com',
  'fcmregistrations.googleapis.com',
  'firebaselogging',
];

function readSitemapPaths() {
  if (!fs.existsSync(SITEMAP)) {
    console.error(
      `[generate] sitemap not found: ${SITEMAP} — run \`bun run generate:sitemap\` first.`
    );
    process.exit(1);
  }
  const collectLocs = xml => [...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map(m => m[1].trim());
  const rootXml = fs.readFileSync(SITEMAP, 'utf8');

  // v2 emits a <sitemapindex> whose <loc>s are per-language child sitemap FILES
  // (sitemap-<lang>.xml), not page URLs. Resolve them to collect real page locs.
  // v1 emits a flat <urlset> whose <loc>s are already page URLs.
  let locs;
  if (/<sitemapindex/i.test(rootXml)) {
    locs = [];
    for (const childUrl of collectLocs(rootXml)) {
      let childFile;
      try {
        childFile = path.join(path.dirname(SITEMAP), path.basename(new URL(childUrl).pathname));
      } catch {
        childFile = path.join(path.dirname(SITEMAP), path.basename(childUrl));
      }
      if (fs.existsSync(childFile)) {
        locs.push(...collectLocs(fs.readFileSync(childFile, 'utf8')));
      }
    }
  } else {
    locs = collectLocs(rootXml);
  }

  return [
    ...new Set(
      locs
        .map(u => {
          try {
            return new URL(u).pathname;
          } catch {
            return null;
          }
        })
        .filter(Boolean)
    ),
  ];
}

function outFileFor(urlPath) {
  const clean = urlPath.replace(/^\/+/, '').replace(/\/+$/, '');
  return path.join(OUT_DIR, clean, 'index.html');
}

async function snapshotOne(context, urlPath) {
  const page = await context.newPage();
  try {
    await page.addInitScript(flag => {
      window[flag] = true;
    }, PRERENDER_FLAG);
    await page.route('**/*', route => {
      const url = route.request().url();
      if (BLOCKED_HOST_FRAGMENTS.some(h => url.includes(h))) return route.abort();
      return route.continue();
    });

    try {
      await page.goto(`${ORIGIN}${urlPath}`, { waitUntil: 'networkidle', timeout: NAV_TIMEOUT });
    } catch {
      await page.waitForLoadState('load').catch(() => {});
    }

    // Wait until React has rendered content into #root.
    await page
      .waitForFunction(
        () => {
          const root = document.getElementById('root');
          return !!root && root.childElementCount > 0;
        },
        { timeout: 10000 }
      )
      .catch(() => {});

    // Every page mounts SEOHead immediately, so a helmet-managed canonical is the
    // signal that the lazy route chunk resolved and the page component rendered
    // (the shell alone satisfies the #root check above, which can capture the
    // Suspense "Loading..." fallback with the generic shell head).
    await page
      .waitForSelector('link[rel="canonical"][data-rh="true"]', {
        state: 'attached',
        timeout: 15000,
      })
      .catch(() => {});
    // ... and wait for the Suspense fallback spinner (role="status") to unmount.
    await page
      .waitForFunction(() => !document.querySelector('#root [role="status"]'), {
        timeout: 15000,
      })
      .catch(() => {});
    await page.waitForTimeout(400);

    const captured = await page.evaluate(() => {
      // react-helmet-managed tags (description, robots, canonical, og:*,
      // twitter:*, hreflang) carry data-rh; <title> and JSON-LD do not, so
      // collect them explicitly too.
      const dataRh = [...document.head.querySelectorAll('[data-rh="true"]')].map(
        el => el.outerHTML
      );
      const parts = [...dataRh];
      const titleEl = document.head.querySelector('title');
      if (titleEl && !dataRh.some(t => /^<title/i.test(t))) parts.unshift(titleEl.outerHTML);
      // Route-specific structured data, excluding the global Organization node
      // (already present in the shell index.html).
      for (const s of document.head.querySelectorAll('script[type="application/ld+json"]')) {
        let isOrg = false;
        try {
          isOrg = JSON.parse(s.textContent || '{}')['@type'] === 'Organization';
        } catch {
          isOrg = false;
        }
        if (!isOrg) parts.push(s.outerHTML);
      }
      const root = document.getElementById('root');
      return { head: parts.join('\n'), body: root ? root.innerHTML : '' };
    });

    if (!captured.body) {
      return { urlPath, ok: false, error: 'empty #root' };
    }

    // Quality gate — refuse to write a snapshot that would hurt SEO:
    //  - no helmet canonical means the page component never mounted (Suspense
    //    fallback captured), so the head would be the generic shell head;
    //  - a role="status" element is the Suspense/loading spinner still on screen;
    //  - near-empty text means the page content never arrived.
    if (!/rel="canonical"/.test(captured.head)) {
      return { urlPath, ok: false, error: 'no canonical in head (page never mounted?)' };
    }
    if (/role="status"/.test(captured.body)) {
      return { urlPath, ok: false, error: 'loading spinner (role="status") still in body' };
    }
    const visibleText = captured.body
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (visibleText.length < 100) {
      return { urlPath, ok: false, error: `body text too thin (${visibleText.length} chars)` };
    }

    // The dev host is flagged non-production → noindex; all sitemap routes are
    // indexable, so force index/follow in the captured head.
    const head = captured.head.replace(
      /content="noindex,\s*nofollow"/gi,
      'content="index, follow"'
    );

    const snapshot = `${HEAD_MARKER}\n${head}\n${BODY_MARKER}\n${captured.body}\n`;
    const outFile = outFileFor(urlPath);
    fs.mkdirSync(path.dirname(outFile), { recursive: true });
    fs.writeFileSync(outFile, snapshot);
    return { urlPath, ok: true };
  } catch (err) {
    return { urlPath, ok: false, error: String(err?.message || err) };
  } finally {
    await page.close().catch(() => {});
  }
}

async function reachable(origin) {
  try {
    await fetch(origin, { method: 'HEAD' });
    return true;
  } catch {
    try {
      await fetch(origin);
      return true;
    } catch {
      return false;
    }
  }
}

async function run() {
  let paths = readSitemapPaths();
  if (FILTER.length) paths = paths.filter(p => FILTER.some(f => p.includes(f)));
  if (Number.isFinite(LIMIT)) paths = paths.slice(0, LIMIT);

  if (!(await reachable(ORIGIN))) {
    console.error(
      `[generate] cannot reach ${ORIGIN} — start the app first (e.g. \`bun run dev\`) ` +
        `or set GENERATE_ORIGIN.`
    );
    process.exit(1);
  }

  console.log(
    `[generate] ${paths.length} page(s) from sitemap | origin ${ORIGIN} | -> ${path.relative(process.cwd(), OUT_DIR)} | concurrency ${CONCURRENCY}`
  );

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ serviceWorkers: 'block' });

  let done = 0;
  let failed = 0;
  const queue = [...paths];
  const startedAt = Date.now();

  async function worker() {
    while (queue.length) {
      const urlPath = queue.shift();
      const result = await snapshotOne(ctx, urlPath);
      done++;
      if (!result.ok) {
        failed++;
        console.warn(`[generate] FAIL ${result.urlPath} :: ${result.error}`);
      }
      if (done % 50 === 0 || done === paths.length) {
        const secs = ((Date.now() - startedAt) / 1000).toFixed(0);
        console.log(`[generate] ${done}/${paths.length} (${failed} failed) ${secs}s`);
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, paths.length) }, worker));

  await ctx.close();
  await browser.close();

  console.log(
    `[generate] done: ${done - failed}/${paths.length} snapshots written, ${failed} failed`
  );
  if (failed > 0) process.exitCode = 1;
}

run().catch(err => {
  console.error('[generate] fatal:', err);
  process.exit(1);
});
