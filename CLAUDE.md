# screenwriter_app

ViaInk: a web screenplay writer. Sign in, manage projects/documents, write in a real-time script editor
(offline-capable), take snapshots, fork, and run AI assists. Private repo, deployed to Cloudflare Pages.
Branded **ViaInk** (`VITE_APP_NAME`), though the internal e2e seam/MCP id is still `fadewright`.

## Tech stack

Bun · Vite 7 · React 19 · TypeScript (strict) · Tailwind 3 (via `@sudobility/design`'s preset) ·
`react-router-dom` 7 · `@tanstack/react-query` 5 · zustand (the lib's stores) · i18next + `react-i18next`
(app-owned init, single `app` namespace, runtime-fetched from `/locales/{lng}/app.json`) · Firebase auth ·
Vitest + jsdom + `fake-indexeddb` · Playwright. RevenueCat/consumables power the AI-credit paywall.

Built on the `@sudobility/*` component stack (same architecture as `../music_app`): `building_blocks`
(topbar/footer shell, `AppPageLayout`, `FormModal`), `components` (`Section`/`Card`/`Button`/`Input`/
`Select*`/`MasterDetailLayout`/…), `design` (Tailwind preset + themes). Screenplay logic lives in the
`screenwriter_lib`/`client`/`types` and `writing_ui`/`writing_core` packages (see "Package resolution").

## Commands

- `bun install` — installs from npm + GitHub Packages (`.npmrc`: `@sudobility:registry=npm.pkg.github.com`).
- `bun run dev` — Vite on **5143** (`strictPort`; the API's CORS allows this origin).
- `bun run typecheck` — `tsc --noEmit` (tsconfig.json: covers src/tests/e2e).
- `bun run build` — `tsc --noEmit -p tsconfig.build.json` (src only) + `vite build`.
- `bunx vitest run` (or `bun run test:unit`) — unit tests in `tests/`. **Never `bun test`.**
- `bun run e2e` — Playwright (`e2e/`); see below.
- No lint script. `bun run icons` regenerates favicons/app icons from `public/logo.svg`.

### Running API + app together (dev)

1. API: `cd ../screenwriter_api && AI_TEST_MODE=1 PUBLIC_APP_URL=http://localhost:5143 DATABASE_URL=postgres://localhost:5432/screenwriter_dev bun run dev` (port 8036; needs local Postgres).
2. App: copy `.env.example` → `.env.local` (`VITE_API_URL=http://localhost:8036`, `VITE_DEV_AUTH=1`), then `bun run dev`, open http://localhost:5143.

### e2e (real stack, no mocks)

`playwright.config.ts` starts the real `../screenwriter_api` (port **18042**, `DATABASE_URL=…/screenwriter_test`,
`AI_TEST_MODE=1`, and **`AI_FIXTURE=1` forced** — the API's own `.env` may autoload `AI_FIXTURE=0`, which would
call real AI) and Vite (port **15173**, `VITE_DEV_AUTH=1`). Needs local Postgres and the `screenwriter_api`
sibling. `E2E_API_PORT`/`E2E_APP_PORT` override. First run: `bunx playwright install chromium`.
Soak test (`e2e/soak.e2e.ts`) is skipped unless `SOAK=1` and needs an already-running stack (see
`playwright.soak.config.ts`).

## Package resolution (important, non-obvious)

The `@sudobility/screenwriter_*` and `writing_ui`/`writing_core` packages are **both** real npm deps **and**
co-developed sibling repos in `~/projects`. `vite.config.ts` + `tsconfig.json` alias each `@sudobility/<pkg>`
to the sibling's `src/index.ts` **only when that sibling directory exists** (`existsSync`); in a single-repo
clone (Cloudflare Pages) the alias is dropped and the import falls through to the published package. **Keep the
vite alias list and tsconfig `paths` in sync.**

- `yjs`/`lib0` must be **one copy** — pinned to `writing_core`'s `node_modules` when present, and
  `resolve.dedupe: [yjs, lib0, react, react-dom, @tanstack/react-query, zustand]` keeps single copies of the
  shared runtime (siblings have their own `node_modules`; a second React/react-query/zustand copy breaks
  hooks/context/stores). `server.fs.allow` includes `..` so Vite can serve sibling source.
- `optimizeDeps.exclude: [yjs, lib0]` and `build…treeshake.moduleSideEffects` marks `writing_core/src/fonts|layout`
  pure so the ~10 MB font tables land only in the lazy `layout-engine` chunk (opened by the Pages view / page count).
- **Stubs system**: three optional `building_blocks` peers this app doesn't use (`subscription-components`,
  `devops-components`, `subscription_lib`) are aliased to no-op modules in `src/stubs/` (vite + tsconfig).

## Architecture

- `main.tsx` providers (outer→inner): ErrorBoundary → QueryClient → ScreenwriterClientProvider →
  ScreenwriterProvider → AuthProvider → SignInProvider → CreditPaywallProvider → BrowserRouter (+ SEOHead).
  `import "./i18n"` (side-effecting) runs before render.
- `services.ts` is the composition root: `configureTheme(retroTheme)` + `createScreenwriter({ auth: authBackendAsPort(auth) })`, run synchronously before React renders. Exports `{ screenwriter, auth }`.
- `App.tsx`: `/:lang/...` routes (LanguageValidator/LanguageRedirect). Layout-wrapped pages render under
  `ScreenContainer` (topbar/footer shell); `d/:documentId` (editor) sits **outside** the layout (full-window).
  Auth is per-route via `RequireSignIn` (gates in place with the sign-in modal — never redirects to /login).
- Editor (`pages/EditorPage.tsx` + its panels/sidebar) is deliberately **not** converted to `@sudobility/components`/i18n — it's domain-specific, follows `writing_ui`'s conventions, and is covered by heavy e2e. Same boundary `music_app` draws at its score editor.
- Offline: `offline/idb-store.ts` implements the lib's `OfflineDocStore` over raw IndexedDB (documents open with the server down). `adapter/session-host.ts` forwards a `DocumentSession` to `writing_ui`'s `ScriptEditorHost`.
- Editor sidebar is a master/detail (`components/EditorSidebar.tsx`/`EntityDetailView.tsx` over `MasterDetailLayout`): Script Structure (Navigator), a **Catalog** of entities (`writing_core` `entity.*` commands, harvested from the live document — no API), character skeletons/life-stages and a Story group (both stored in generic `EntityJSON.attributes` bags on hidden `misc` entities — no schema changes), and AI actions. AI reads/writes are document commands (undoable, sync, offline), not DB rows.

## Auth

- **Page vs modal rule** (same as the RN apps): if the user *navigates in order to* sign in → full
  `LoginPage` at `/:lang/login` (top bar / home "Log in"). If sign-in is needed *in the middle of something else*
  (a gated page reached signed out, or an action needing an account) → `LoginModal` opened **over the current
  page**, which stays put. Never `navigate("/login")` for the second case. Closing the modal = nothing happens.
- `VITE_DEV_AUTH=1` replaces the email/password form with a dev email-only bypass (lib's `DevAuthPort`; token
  `dev:<uid>:<email>`, accepted by the API only with `AI_TEST_MODE=1`). Every e2e spec uses it
  (label `"Dev login (email, no password)"`). Otherwise real Firebase email/password + Google sign-in
  (`src/auth/backend.ts`, direct `firebase/auth` SDK — offered when `VITE_FIREBASE_*` apiKey+projectId are set).
- `src/app/AuthContext.tsx` is this app's **own** `useAuth()`, subscribing to the same backend instance
  `services.ts` built — all UI reads it, **not** `screenwriter_lib`'s re-exported `useAuth()` (still used
  internally by the lib's own hooks). `backend.ts` unifies Firebase + dev into one `AuthBackend`;
  `authBackendAsPort()` adapts it to the lib's `AuthPort` (zero lib changes needed).

## Gotchas

- **`AppPageLayout` needs all three**: `page={{ layoutMode: "full", maxWidth: "5xl", contentClassName: "w-full min-w-0" }}` (in `ScreenContainer`). Missing any one collapses content width to shrink-to-fit (anywhere from ~32px up) with **no console error** — verify visually / via `getBoundingClientRect()`.
- **i18n cold-load**: `t(key, { returnObjects: true })` returns the raw key string on the first render (http-backend is async, `useSuspense: false`), so `.map()` throws. Use `util/i18n-array.ts`'s `translatedArray(t, key)` for any translated array rendered with `.map`.
- **Theme**: `retroTheme` via `configureTheme`/`generateThemeCSS` in `services.ts`. Every `variant="primary"` component reads the active theme; a hand-rolled `<button className>` bypasses it and looks wrong — always use `@sudobility/components`' `Button`.
- **Playwright matching is case-insensitive substring** unless `{ exact: true }` — "Sign in" matches "Sign in with Google", "Password" matches "Dev login (email, no password)". `FormModal`/`Select` have no `data-testid` seam; select by `getByRole("dialog")`/role/text and scope to the dialog when two same-named buttons coexist.
- **404 route**: a relative `<Navigate to="404">` from `*` loops forever (`/en/x/404/404/…`). Use an absolute lang-prefixed target (`App.tsx`'s `CatchAll`).
- **API `.env` autoloads a DB** (Bun) — always pass `DATABASE_URL` explicitly when starting it for tests.
- The API must expose `X-Epoch`/`X-State-Vector` via CORS or rebase never completes (fixed in screenwriter_api).
- **Printing** never prints the on-screen layout: sheets render in a `<body>` portal (`.print-sheets`) with `#root` hidden; `@page { size: letter; margin: 0 }`. Don't test with `emulateMedia('print')` alone (keeps the viewport width) — `e2e/print.e2e.ts` prints at narrow widths too.
- Pasting multi-line text auto-tags screenplay roles inside `writing_ui` (no app code). `.txt` import is server-side smart plain-text detection in `writing_formats`.

## Related repos (in `~/projects`)

`screenwriter_api` (backend) · `screenwriter_lib`/`client`/`types` · `writing_ui`/`writing_core` ·
`mail_box_components` (source for `@sudobility/components`) · `music_app` (the architecture this app mirrors) ·
`screenwriter_plans` (specs, e2e screenshot targets).
