import { useState } from "react";
import { resolveStyle } from "@sudobility/writing_core";
import type { ScriptEditorHost } from "@sudobility/writing_ui";
import { FormModal } from "@sudobility/components";

const btn = "border border-neutral-300 rounded px-2 py-1 text-sm bg-white hover:bg-neutral-100 disabled:opacity-40 disabled:hover:bg-white";
const when = (ms: number | null) => (ms ? new Date(ms).toLocaleString() : "");

/** Scene-number and page locking controls (Page setup panel). Status text comes from `production`. */
export function LockingSection({ host }: { host: ScriptEditorHost }) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const model = host.model;
  const template = model.template();
  const prod = model.productionState();
  const sceneStyle = template.styles.some(s => s.id === template.sceneNumbering.styleId) ? resolveStyle(template, template.sceneNumbering.styleId) : null;
  const numbered = sceneStyle?.numbering?.enabled === true;

  const run = (id: string) => {
    const r = host.execute([{ id, params: {} }], { kind: "local-command" });
    setError(r.ok ? null : `Could not run ${id}.`);
  };

  return (
    <section className="space-y-2" data-testid="locking-section">
      <h4 className="text-xs font-semibold uppercase text-neutral-500">Locking</h4>

      <div className="space-y-1">
        <p className="text-sm" data-testid="scene-lock-status">
          {prod.scenesLocked ? `Scene numbers locked at ${when(prod.scenesLockedAt)}` : "Scene numbers are not locked"}
        </p>
        <div className="flex gap-2 flex-wrap">
          <button className={btn} data-testid="lock-scenes" disabled={!numbered} title={numbered ? "Freeze the current scene numbers; new scenes become 12A, 12B" : "Turn scene numbers on first"} onClick={() => run("scene.lockNumbers")}>
            {prod.scenesLocked ? "Relock scene numbers" : "Lock scene numbers"}
          </button>
          <button className={btn} data-testid="unlock-scenes" disabled={!prod.scenesLocked} onClick={() => run("scene.unlockNumbers")}>
            Unlock scene numbers
          </button>
        </div>
      </div>

      <div className="space-y-1">
        <p className="text-sm" data-testid="page-lock-status">
          {prod.pagesLocked ? `Pages locked at ${when(prod.pagesLockedAt)} (${prod.pageLocks.length} locked)` : "Pages are not locked"}
        </p>
        <div className="flex gap-2 flex-wrap">
          <button className={btn} data-testid="lock-pages" onClick={() => setConfirming(true)}>
            {prod.pagesLocked ? "Lock A pages" : "Lock pages"}
          </button>
          <button className={btn} data-testid="unlock-pages" disabled={!prod.pagesLocked} onClick={() => run("page.unlock")}>
            Unlock pages
          </button>
        </div>
        <p className="text-xs text-neutral-600">Locked pages keep their numbers: text that grows past a page spills onto A pages (12A), and pages that shrink stay short.</p>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}

      <FormModal
        open={confirming}
        title={prod.pagesLocked ? "Lock the A pages?" : "Lock pages?"}
        onClose={() => setConfirming(false)}
        actions={[
          { label: "Cancel", onClick: () => setConfirming(false), variant: "ghost" },
          {
            label: "Lock pages",
            onClick: () => {
              setConfirming(false);
              run("page.lock");
            },
          },
        ]}
      >
        <p className="text-sm">
          {prod.pagesLocked
            ? "Every A page becomes a locked page with its current number."
            : "The current page breaks and page numbers are frozen. Later edits will not move them; extra text goes onto A pages."}
        </p>
      </FormModal>
    </section>
  );
}
