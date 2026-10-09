# screenwriter_app

ViaInk web app: sign in (Firebase email/password or Google; dev login with `VITE_DEV_AUTH=1`), manage projects and documents, write in the script editor, save snapshots, go back to one or fork it into a new document.

Private, local-packages phase. It expects its sibling repos next to it in `~/projects`: `screenwriter_api`, `screenwriter_lib`, `screenwriter_client`, `screenwriter_types`, `writing_ui`, `writing_core` (each with `bun install` done).

## Run it

Local Postgres 15 with a `screenwriter_dev` database is required.

```sh
# 1. the API (port 8036), in one terminal
cd ~/projects/screenwriter_api
bun install
bun run db:init
AI_TEST_MODE=1 PUBLIC_APP_URL=http://localhost:5143 DATABASE_URL=postgres://localhost:5432/screenwriter_dev bun run dev

# 2. the app (port 5143), in another
cd ~/projects/screenwriter_app
bun install
cp .env.example .env.local   # VITE_API_URL=http://localhost:8036, VITE_DEV_AUTH=1
bun run dev
```

Open http://localhost:5143, type any email and any password (the dev login ignores it), create a project, then a document.

## Scripts

- `bun run dev` - Vite dev server on 5143
- `bun run build` - typecheck and production bundle
- `bun run typecheck` - `tsc --noEmit`
- `bun run test:unit` - unit tests (`bunx vitest run`)
- `bun run e2e` - Playwright against the real API (`screenwriter_test` database; starts both servers; first run `bunx playwright install chromium`)

## Notes

Login is real Firebase email/password (sign-in, sign-up, password reset) plus Google; with `VITE_DEV_AUTH=1` the email form is the dev login instead (the e2e suite uses it). Sign-in has two forms: the **Log in** links (top bar, home page) go to the full login page; anything that needs an account in the middle of something else — opening projects or a document while signed out, an action that needs an account — opens a sign-in modal over the current page and stays there (closing it leaves the page as it was; no redirect to the login page). Documents are also cached in IndexedDB so reopening one works with the server down.

License: BUSL-1.1
