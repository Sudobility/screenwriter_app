import { useState } from "react";
import type { EntityKind } from "@sudobility/writing_core";
import type { ScriptEditorHost } from "@sudobility/writing_ui";
import { useModelTick } from "../util/use-model-tick";
import { kindLabel } from "../util/entity-kind-labels";
import { sceneCountOf } from "../util/entity-scene-count";

const btn = "border border-neutral-300 rounded px-2 py-1 text-sm bg-white hover:bg-neutral-100 disabled:opacity-40 disabled:hover:bg-white";

const SOURCE_LABEL: Record<"speaker" | "heading" | "tag", string> = { speaker: "Speaks", heading: "Scene heading", tag: "Tagged" };

/**
 * The master/detail layout's `detailContent` when a Catalog entity is selected in `EditorSidebar`
 * (instead of the script editor) — the same fields and `entity.*` commands `CatalogPanel.tsx` used to
 * show in its own flyout, relocated here: name (rename), kind + scene count, aliases (add/remove),
 * description, "Appears in" occurrences (`onJumpTo`, same jump mechanism as `Navigator`/`AiPanel`),
 * delete with the existing force-confirm flow.
 */
export function EntityDetailView({
  host,
  entityId,
  onJumpTo,
  onDeleted,
}: {
  host: ScriptEditorHost;
  entityId: string;
  onJumpTo(elementId: string): void;
  /** The entity was deleted (or no longer exists) — the caller clears the selection. */
  onDeleted(): void;
}) {
  useModelTick(host);
  const [error, setError] = useState<string | null>(null);
  const [deleteBlocked, setDeleteBlocked] = useState(false);
  const [alias, setAlias] = useState("");

  const run = (id: string, params: Record<string, unknown>) => {
    const r = host.execute([{ id, params }], { kind: "local-command" });
    if (!r.ok) {
      setError(`Could not ${id}.`);
      return { ok: false as const, detail: r.detail };
    }
    setError(null);
    return { ok: true as const };
  };

  const entity = host.model.entity(entityId as never);

  if (!entity) {
    onDeleted();
    return null;
  }

  const occurrences = host.model.occurrences(entity.id);

  const deleteEntity = (force: boolean) => {
    const res = run("entity.delete", { entityId: entity.id, ...(force ? { force: true } : {}) });
    if (res.ok) onDeleted();
    else if (!force && (res.detail?.tagIds || res.detail?.locationElementIds)) setDeleteBlocked(true);
  };

  return (
    <div className="space-y-4" data-testid="entity-detail">
      <div>
        <label className="flex flex-col text-xs text-neutral-500">
          Name
          <input
            data-testid="entity-name"
            className="border border-neutral-300 rounded px-2 py-1 text-sm bg-white text-neutral-900"
            defaultValue={entity.name}
            key={entity.id}
            onBlur={e => e.target.value.trim() && e.target.value.trim() !== entity.name && run("entity.update", { entityId: entity.id, patch: { name: e.target.value.trim() } })}
          />
        </label>
        <p className="text-xs text-neutral-500 mt-1">
          {kindLabel(entity.kind as EntityKind)} &middot; {sceneCountOf(host, entity.id)} {sceneCountOf(host, entity.id) === 1 ? "scene" : "scenes"}
        </p>
      </div>

      <div>
        <h4 className="text-xs font-semibold uppercase text-neutral-500 mb-1">Aliases</h4>
        <ul className="space-y-1">
          {entity.aliases.map(a => (
            <li key={a} className="flex items-center gap-2 text-sm">
              <span className="flex-1">{a}</span>
              <button className={`${btn} text-xs`} onClick={() => run("entity.removeAlias", { entityId: entity.id, alias: a })}>
                Remove
              </button>
            </li>
          ))}
        </ul>
        <div className="flex gap-2 mt-2">
          <input
            aria-label="New alias"
            className="flex-1 border border-neutral-300 rounded px-2 py-1 text-sm bg-white text-neutral-900"
            value={alias}
            onChange={e => setAlias(e.target.value)}
          />
          <button
            className={btn}
            disabled={!alias.trim()}
            onClick={() => { if (alias.trim()) { run("entity.addAlias", { entityId: entity.id, alias: alias.trim() }); setAlias(""); } }}
          >
            Add
          </button>
        </div>
      </div>

      <div>
        <label className="flex flex-col text-xs text-neutral-500">
          Description
          <textarea
            data-testid="entity-description"
            rows={3}
            className="border border-neutral-300 rounded px-2 py-1 text-sm bg-white text-neutral-900"
            defaultValue={entity.description.plain}
            key={`${entity.id}-desc`}
            onBlur={e => e.target.value !== entity.description.plain && run("entity.update", { entityId: entity.id, patch: { description: e.target.value } })}
          />
        </label>
      </div>

      <div>
        <h4 className="text-xs font-semibold uppercase text-neutral-500 mb-1">Appears in</h4>
        {occurrences.length === 0 && <p className="text-sm text-neutral-500">Not used anywhere yet.</p>}
        <ul className="space-y-1">
          {occurrences.map((o, i) => (
            <li key={`${o.elementId}-${i}`}>
              <button className="text-sm text-blue-700 hover:underline" onClick={() => onJumpTo(o.elementId)}>
                {SOURCE_LABEL[o.source]}
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div className="pt-2 border-t border-neutral-200">
        {deleteBlocked ? (
          <div className="space-y-2">
            <p className="text-xs text-red-600">This entity is used elsewhere (a tag, or a scene's location). Delete anyway?</p>
            <div className="flex gap-2">
              <button className={`${btn} text-xs`} onClick={() => deleteEntity(true)}>
                Delete anyway
              </button>
              <button className={`${btn} text-xs`} onClick={() => setDeleteBlocked(false)}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button className={`${btn} text-xs`} onClick={() => deleteEntity(false)}>
            Delete
          </button>
        )}
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
