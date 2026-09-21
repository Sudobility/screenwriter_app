# screenwriter_app

Fadewright web app (slice F4 of `../screenwriter_plans/plans/2026-09-20-frontend-mvp.md`). Private repo, `private: true`, local-packages phase: no publishing, no version bumps, no CI workflow.

## Tech stack

Bun, Vite 7, React 19, TypeScript, Tailwind 3 (plain, no `@sudobility/building_blocks`/`components`), `react-router` 7, `@tanstack/react-query` 5 (one `QueryClient`; the client library's hooks read it), zustand (used by the lib's stores), Vitest + jsdom + `fake-indexeddb`, Playwright (`@playwright/test`).

## Structure

```
src/
  main.tsx            providers: QueryClient > ScreenwriterClientProvider > ScreenwriterProvider > BrowserRouter
  App.tsx             signed out -> LoginPage; signed in -> routes / , /p/:projectId , /d/:documentId
  config.ts           VITE_API_URL (default http://localhost:8042), VITE_DEV_AUTH ("1" enables the dev login)
  services.ts         createScreenwriter({ fetch NetworkClient, baseUrl, auth port, IndexedDB offline store })
  auth/index.ts       createAuthPort(): DevAuthPort when VITE_DEV_AUTH=1, else a stub that refuses to sign in
  offline/idb-store.ts  IndexedDbOfflineDocStore (raw IndexedDB) implementing the lib's OfflineDocStore
  adapter/session-host.ts  sessionToHost(): DocumentSession -> writing_ui ScriptEditorHost (pure forwarder)
  pages/              LoginPage, DashboardPage (projects at /, documents at /p/:id), EditorPage
  components/         Shell, SnapshotsPanel
tests/                unit tests (adapter, IndexedDB store)
e2e/app.e2e.ts        Playwright: the whole flow against the real API
```

## Commands

- `bun install`, `bun run dev` (Vite on **5173**, strict; the API's CORS allows this origin), `bun run typecheck` (`bunx tsc --noEmit`), `bunx vitest run` (never `bun test`), `bun run build`.
- `bun run e2e` = `bunx playwright test`. Starts the API (`../screenwriter_api`, `bun run db:init && bun run src/index.ts`, port 18042, `DATABASE_URL=postgres://localhost:5432/screenwriter_test`, `AI_TEST_MODE=1`, `PUBLIC_APP_URL`/`CORS_ORIGINS` = the app origin) and Vite (port 15173) itself; needs local Postgres. `E2E_API_PORT`/`E2E_APP_PORT` override the ports. Screenshots go to `../screenwriter_plans/.superpowers/sdd/frontend-f4-*.png`. First time: `bunx playwright install chromium`.

- Soak (`e2e/soak.e2e.ts`, skipped unless `SOAK=1`): randomized editing sessions hunting the two anomalies in `../screenwriter_plans/.superpowers/sdd/known-gaps.md`. It needs an already-running stack on non-dev ports (API 18342 with `AI_TEST_MODE=1`, `DATABASE_URL=...screenwriter_test`, `PUBLIC_APP_URL`/`CORS_ORIGINS=http://localhost:15373`; Vite 15373 with `VITE_API_URL=http://localhost:18342 VITE_DEV_AUTH=1`). Run: `SOAK=1 SOAK_SEEDS=1,2,3 SOAK_STEPS=60 [SOAK_CHAOS=1] [SOAK_VERBOSE=1] bunx playwright test -c playwright.soak.config.ts -g "soak seed"`. `SOAK_CHAOS` restarts the API on port 18342 mid-run. `SOAK_MECH=1` also enables a probe showing a letter typed on the focused style picker restyles the editor's stale selection.

## Running API + app together (dev)

1. API: `cd ../screenwriter_api && AI_TEST_MODE=1 PUBLIC_APP_URL=http://localhost:5173 DATABASE_URL=postgres://localhost:5432/screenwriter_dev bun run dev` (its `.env` already has these; port 8042).
2. App: `bun run dev`, open http://localhost:5173. `.env.local` (git-ignored, copy of `.env.example`) sets `VITE_API_URL=http://localhost:8042`, `VITE_DEV_AUTH=1`.

## Dev auth flow

`VITE_DEV_AUTH=1` shows an email-only login backed by the lib's `DevAuthPort` (persisted in `localStorage` key `screenwriter.devEmail`; sign-out clears it). Token = `dev:<uid>:<email>`, uid = hash of the email, accepted by the API only with `AI_TEST_MODE=1` (REST bearer and the sync socket's `auth` frame). **Real Firebase login is not implemented**: it needs a Firebase web config here and `FIREBASE_*` admin credentials on the API. To add it, implement `AuthPort` (`../screenwriter_lib/src/ports/auth.ts`) with the Firebase web SDK and return it from `createAuthPort()` when `VITE_FIREBASE_*` is set; nothing else changes.

## Local packages: aliases and dedupe (important)

`vite.config.ts` aliases `@sudobility/screenwriter_lib|screenwriter_client|screenwriter_types|writing_ui|writing_core` to the sibling repos' `src/index.ts`, and `yjs`/`lib0` to `../writing_core/node_modules/...` (`yjs/dist/yjs.mjs`: ONE Yjs instance). `tsconfig.json` `paths` mirror it (two-entry `yjs` mapping: extensionless `dist/yjs` first, then the directory for types). Keep the two in sync. `resolve.dedupe: ['yjs','lib0','react','react-dom','@tanstack/react-query','zustand']` is required: the siblings have their own `node_modules`, and the client's hooks (react-query, react) and the lib's stores (zustand) would otherwise load a second copy (broken hooks/context). `server.fs.allow` includes the parent directory so Vite can serve the siblings. `optimizeDeps.exclude` keeps yjs/lib0 out of the pre-bundler for the same reason. The tsconfig also maps `react`, `react-dom`, `zustand`, `@tanstack/react-query` to this app's `node_modules` so types are one copy.

## Behaviour notes

- The editor route renders `ScriptEditor` + `ElementStylePicker` from `writing_ui`. `useDocumentSession` opens the session (offline copy first, then sync). Rebase: the lib emits `rebased`; `EditorPage` shows a banner ("Document replaced by snapshot", plus a preserved-locally note if `lostLocalEdits`). The session object is stable across a rebase, the model inside it is replaced; the editor re-reads `host.model` on `subscribe(null)`.
- `EditorPage` is keyed by document id so a fork (navigation to `/d/<new>`) remounts cleanly.
- Snapshots panel uses the session's methods directly (`listSnapshots`, `createSnapshot`, `openSnapshot`, `forkSnapshot`, `listVersions`); Open and Fork use inline confirm/title steps, not `window.confirm/prompt`.
- Status label: `connecting`/`disconnected|error` -> Offline; `state: synced` -> Synced; anything else Syncing.

## Gotchas

- The API must expose `X-Epoch`/`X-State-Vector` via CORS (fixed in screenwriter_api 6818de6); without it a browser reads every state epoch as 0 and rebase never completes.
- API `.env` autoloads the DEV database; always pass `DATABASE_URL` explicitly when starting it for tests.
- `writing_core` has stray compiled `.js/.d.ts` next to its `.ts` sources; harmless here.
- Stubs not used on purpose: no `@sudobility/building_blocks`, `components`, or the stub system; the UI is expected to change.

## Related projects

`../screenwriter_lib`, `../screenwriter_client`, `../screenwriter_types`, `../screenwriter_api`, `../writing_ui`, `../writing_core`, `../screenwriter_plans`, `../sudojo_app` (convention reference).
