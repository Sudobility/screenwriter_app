# screenwriter_app

Fadewright web app: sign in (dev login), manage projects and documents, write in the script editor, save snapshots, go back to one or fork it into a new document.

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

Open http://localhost:5143, type any email (no password), create a project, then a document.

## Scripts

- `bun run dev` - Vite dev server on 5143
- `bun run build` - typecheck and production bundle
- `bun run typecheck` - `tsc --noEmit`
- `bun run test:unit` - unit tests (`bunx vitest run`)
- `bun run e2e` - Playwright against the real API (`screenwriter_test` database; starts both servers; first run `bunx playwright install chromium`)

## Notes

Real Firebase login is not wired yet (dev login only, `VITE_DEV_AUTH=1`). Documents are also cached in IndexedDB so reopening one works with the server down.

License: BUSL-1.1
