import { existsSync } from "node:fs";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const p = (rel: string) => fileURLToPath(new URL(rel, import.meta.url));
const stub = (name: string) => p(`./src/stubs/${name}.ts`);

// The co-developed sibling repos (screenwriter_lib/client/types, writing_ui/core) are ALSO published
// to npm (package.json dependencies). Locally they are checked out next to this repo, so each alias
// below points Vite at the sibling's live source — but ONLY when that sibling is actually present.
// In a single-repo clone (e.g. Cloudflare Pages), the ../sibling dirs are absent, the alias is dropped,
// and the import falls through to the published package in node_modules instead. Keep this list in sync
// with tsconfig.json `paths` (tsc already falls back to node_modules when a path target is missing).
// yjs/lib0 MUST be a single copy: locally they are pinned to writing_core's copy; without the sibling
// they resolve from node_modules (writing_core's transitive dep) and `resolve.dedupe` keeps one copy.
const siblingAlias = (name: string, rel: string) =>
  existsSync(p(rel)) ? [{ find: new RegExp(`^@sudobility/${name}$`), replacement: p(rel) }] : [];
const writingCoreNm = p("../writing_core/node_modules");
const hasWritingCore = existsSync(writingCoreNm);

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      ...siblingAlias("screenwriter_lib", "../screenwriter_lib/src/index.ts"),
      ...siblingAlias("screenwriter_client", "../screenwriter_client/src/index.ts"),
      ...siblingAlias("screenwriter_types", "../screenwriter_types/src/index.ts"),
      ...siblingAlias("writing_ui", "../writing_ui/src/index.ts"),
      ...siblingAlias("writing_core", "../writing_core/src/index.ts"),
      ...(hasWritingCore
        ? [
            { find: /^yjs$/, replacement: p("../writing_core/node_modules/yjs/dist/yjs.mjs") },
            { find: /^lib0\/(.*)$/, replacement: p("../writing_core/node_modules/lib0/") + "$1" },
          ]
        : []),
      // building_blocks' optional peer deps this app doesn't install for real (the sudobility "stubs system" —
      // see ~/projects/music_app's vite.config.ts/CLAUDE.md for the precedent).
      { find: /^@sudobility\/subscription-components$/, replacement: stub("subscription-components") },
      { find: /^@sudobility\/devops-components$/, replacement: stub("devops-components") },
      { find: /^@sudobility\/subscription_lib$/, replacement: stub("subscription_lib") },
    ],
    dedupe: ["yjs", "lib0", "react", "react-dom", "@tanstack/react-query", "zustand"],
  },
  build: {
    rollupOptions: {
      // writing_core's barrel re-exports the layout engine and its ~10 MB of generated font metrics. Those modules are
      // pure (they only build tables), so tell Rollup it may drop them when unused: the initial bundle then omits them
      // and only the lazy `layout-engine` chunk (opened with the Pages view / page counter) carries them.
      treeshake: {
        moduleSideEffects: (id) => !/\/writing_core\/src\/(fonts|layout)\//.test(id),
      },
    },
  },
  server: {
    port: 5143,
    strictPort: true,
    fs: { allow: [p("."), p(".."), p("../writing_core")] },
  },
  optimizeDeps: { exclude: ["yjs", "lib0"] },
  test: {
    environment: "jsdom",
    include: ["tests/**/*.test.{ts,tsx}"],
    testTimeout: 30000,
    // Node/Vitest ESM interop for the sudobility UI packages (matches music_app's own vitest config).
    server: {
      deps: {
        inline: [/@sudobility\/(building_blocks|components|auth-components|design)/],
      },
    },
  },
});
