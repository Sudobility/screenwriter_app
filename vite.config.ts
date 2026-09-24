import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const p = (rel: string) => fileURLToPath(new URL(rel, import.meta.url));
const stub = (name: string) => p(`./src/stubs/${name}.ts`);

// Sibling repos resolve by path (no build step, no publishing). Mirrors tsconfig `paths`; keep in sync.
// yjs/lib0 MUST point at writing_core's copy and react/react-dom/react-query/zustand MUST be one copy:
// the siblings have their own node_modules, so `resolve.dedupe` pins them to this app's.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      { find: /^@sudobility\/screenwriter_lib$/, replacement: p("../screenwriter_lib/src/index.ts") },
      { find: /^@sudobility\/screenwriter_client$/, replacement: p("../screenwriter_client/src/index.ts") },
      { find: /^@sudobility\/screenwriter_types$/, replacement: p("../screenwriter_types/src/index.ts") },
      { find: /^@sudobility\/writing_ui$/, replacement: p("../writing_ui/src/index.ts") },
      { find: /^@sudobility\/writing_core$/, replacement: p("../writing_core/src/index.ts") },
      { find: /^@sudobility\/writing_formats\/fountain-classify$/, replacement: p("../writing_formats/src/fountain/classify.ts") },
      { find: /^yjs$/, replacement: p("../writing_core/node_modules/yjs/dist/yjs.mjs") },
      { find: /^lib0\/(.*)$/, replacement: p("../writing_core/node_modules/lib0/") + "$1" },
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
