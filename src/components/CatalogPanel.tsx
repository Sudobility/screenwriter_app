import { useEffect, useState } from "react";
import { ENTITY_KINDS, type EntityKind } from "@sudobility/writing_core";
import type { ScriptEditorHost } from "@sudobility/writing_ui";
import { useModelTick } from "../util/use-model-tick";

const btn = "border border-neutral-300 rounded px-2 py-1 text-sm bg-white hover:bg-neutral-100 disabled:opacity-40 disabled:hover:bg-white";

/** camelCase kind -> a readable label ("makeupHair" -> "Makeup/Hair"); everything else just gets its first
 * letter capitalized. */
const KIND_LABELS: Partial<Record<EntityKind, string>> = {
  makeupHair: "Makeup/Hair", specialEffect: "Special effect", visualEffect: "Visual effect", mechanicalEffect: "Mechanical effect",
  backgroundActor: "Background actor", additionalLabor: "Additional labor", animalHandler: "Animal handler", artDepartment: "Art department",
  scriptDay: "Script day", specialEquipment: "Special equipment", setDressing: "Set dressing",
};
const kindLabel = (k: EntityKind) => KIND_LABELS[k] ?? k[0]!.toUpperCase() + k.slice(1);

const SOURCE_LABEL: Record<"speaker" | "heading" | "tag", string> = { speaker: "Speaks", heading: "Scene heading", tag: "Tagged" };

/**
 * The "Catalog" panel: browse and manage every entity kind (character, location, prop, vehicle,
 * ... — all 24 of `ENTITY_KINDS`), entirely from the live document (`host.model.entities()`/
 * `.occurrences()`, `entity.*` commands) — no API call, matching `RevisionsPanel`/`LockingSection`'s
 * architecture, not `AiPanel`/`ImportScript`'s (those genuinely need the API). Named "Catalog" (not
 * "Entities") for the button/panel itself — `entity`/`EntityKind` stay `writing_core`'s own vocabulary
 * underneath, unrenamed; only this app-level label changed.
 *
 * Only `character`/`location` are ever auto-harvested from the script (scene headings, character
 * cues), and only when `entity.rebuild` actually runs — it does not happen on every edit. So this
 * panel runs it once automatically the first time it opens (harmless to repeat: harvesting no-ops,
 * no Yjs transaction, when nothing changed) and offers "Refresh from script" for later. Every other
 * kind only ever exists if created here (or elsewhere) by hand via `entity.create`.
 *
 * Out of scope for now (see CLAUDE.md): merge, variants (age/version), tag categories, worksheets,
 * and kind-specific custom fields/attributes (a vehicle's make/model, a prop's quantity, ...).
 */
export function CatalogPanel({
  host,
  onClose,
  onJumpTo,
}: {
  host: ScriptEditorHost;
  onClose(): void;
  onJumpTo(elementId: string): void;
}) {
  useModelTick(host);
  const [kind, setKind] = useState<EntityKind | "">("");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleteBlocked, setDeleteBlocked] = useState<string | null>(null);
  const [newKind, setNewKind] = useState<EntityKind>("character");
  const [newName, setNewName] = useState("");
  const [alias, setAlias] = useState("");

  // Refresh character/location from the script once per panel-open, so a document that has never
  // been rebuilt doesn't show an empty list the first time someone opens this.
  useEffect(() => {
    host.execute([{ id: "entity.rebuild", params: {} }], { kind: "local-command" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [host]);

  // A single-command batch only ever succeeds if that one command does, so a refusal always
  // surfaces at the batch level (`r.ok === false`); `results[0]` is only for the effects of a win.
  const run = (id: string, params: Record<string, unknown>) => {
    const r = host.execute([{ id, params }], { kind: "local-command" });
    if (!r.ok) {
      setError(`Could not ${id}.`);
      return { ok: false as const, detail: r.detail };
    }
    setError(null);
    const first = r.results[0];
    return { ok: true as const, effects: (first?.ok && first.effects) || [] };
  };

  const all = host.model.entities({ kind: kind || undefined });
  const q = query.trim().toLowerCase();
  const list = q ? all.filter(e => e.name.toLowerCase().includes(q) || e.aliases.some(a => a.toLowerCase().includes(q))) : all;
  const selected = selectedId ? host.model.entity(selectedId as never) : undefined;
  const occurrences = selected ? host.model.occurrences(selected.id) : [];
  // Distinct scenes among an entity's occurrences — `EntityView` (the live model) carries no
  // precomputed count like the API projection's `EntitySummary.sceneCount` does.
  const sceneCountOf = (entityId: string) => new Set(host.model.occurrences(entityId as never).map(o => o.sceneId).filter(Boolean)).size;

  const addEntity = () => {
    const name = newName.trim();
    if (!name) return;
    const res = run("entity.create", { kind: newKind, name });
    if (res.ok) {
      setNewName("");
      const created = res.effects.find(e => e.kind === "entityCreated");
      if (created) setSelectedId(created.id);
    } else if (res.detail?.existingId) {
      setError(`An entity named "${name}" already exists.`);
    }
  };

  const deleteEntity = (force: boolean) => {
    if (!selected) return;
    const res = run("entity.delete", { entityId: selected.id, ...(force ? { force: true } : {}) });
    if (res.ok) {
      setSelectedId(null);
      setDeleteBlocked(null);
    } else if (!force && (res.detail?.tagIds || res.detail?.locationElementIds)) {
      setDeleteBlocked(selected.id);
    }
  };

  return (
    <aside className="print:hidden w-80 shrink-0 border-l border-neutral-200 bg-neutral-50 overflow-y-auto p-3 space-y-4" aria-label="Catalog" data-testid="catalog-panel">
      <div className="flex items-center">
        <h3 className="font-semibold">Catalog</h3>
        <button className="ml-auto border border-neutral-300 rounded px-2 py-1 text-xs hover:bg-neutral-100" onClick={onClose}>
          Close
        </button>
      </div>

      {selected ? (
        <section className="space-y-3" data-testid="entity-detail">
          <button className="text-xs text-neutral-600 hover:underline" onClick={() => { setSelectedId(null); setDeleteBlocked(null); }}>
            &larr; Back to list
          </button>

          <div>
            <label className="flex flex-col text-xs text-neutral-500">
              Name
              <input
                data-testid="entity-name"
                className="border border-neutral-300 rounded px-2 py-1 text-sm bg-white text-neutral-900"
                defaultValue={selected.name}
                key={selected.id}
                onBlur={e => e.target.value.trim() && e.target.value.trim() !== selected.name && run("entity.update", { entityId: selected.id, patch: { name: e.target.value.trim() } })}
              />
            </label>
            <p className="text-xs text-neutral-500 mt-1">{kindLabel(selected.kind)} &middot; {sceneCountOf(selected.id)} {sceneCountOf(selected.id) === 1 ? "scene" : "scenes"}</p>
          </div>

          <div>
            <h4 className="text-xs font-semibold uppercase text-neutral-500 mb-1">Aliases</h4>
            <ul className="space-y-1">
              {selected.aliases.map(a => (
                <li key={a} className="flex items-center gap-2 text-sm">
                  <span className="flex-1">{a}</span>
                  <button className={`${btn} text-xs`} onClick={() => run("entity.removeAlias", { entityId: selected.id, alias: a })}>
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
                onClick={() => { if (alias.trim()) { run("entity.addAlias", { entityId: selected.id, alias: alias.trim() }); setAlias(""); } }}
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
                defaultValue={selected.description.plain}
                key={`${selected.id}-desc`}
                onBlur={e => e.target.value !== selected.description.plain && run("entity.update", { entityId: selected.id, patch: { description: e.target.value } })}
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
            {deleteBlocked === selected.id ? (
              <div className="space-y-2">
                <p className="text-xs text-red-600">This entity is used elsewhere (a tag, or a scene's location). Delete anyway?</p>
                <div className="flex gap-2">
                  <button className={`${btn} text-xs`} onClick={() => deleteEntity(true)}>
                    Delete anyway
                  </button>
                  <button className={`${btn} text-xs`} onClick={() => setDeleteBlocked(null)}>
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
        </section>
      ) : (
        <>
          <div className="flex gap-2">
            <select
              aria-label="Kind"
              data-testid="entity-kind-filter"
              className="border border-neutral-300 rounded px-2 py-1 text-sm bg-white text-neutral-900"
              value={kind}
              onChange={e => setKind(e.target.value as EntityKind | "")}
            >
              <option value="">All kinds</option>
              {ENTITY_KINDS.map(k => (
                <option key={k} value={k}>
                  {kindLabel(k)}
                </option>
              ))}
            </select>
            <button className={`${btn} text-xs`} onClick={() => run("entity.rebuild", {})} title="Re-scan the script for character and location entities">
              Refresh
            </button>
          </div>
          <input
            aria-label="Search entities"
            placeholder="Search by name or alias"
            className="w-full border border-neutral-300 rounded px-2 py-1 text-sm bg-white text-neutral-900"
            value={query}
            onChange={e => setQuery(e.target.value)}
          />

          <ul className="space-y-1" data-testid="entity-list">
            {list.length === 0 && <p className="text-sm text-neutral-500">No entities yet.</p>}
            {list.map(e => (
              <li key={e.id}>
                <button
                  className="w-full text-left rounded px-2 py-1 text-sm hover:bg-neutral-100 flex items-center gap-2"
                  data-testid="entity-row"
                  onClick={() => setSelectedId(e.id)}
                >
                  <span className="flex-1">{e.name}</span>
                  <span className="text-xs text-neutral-500">{kindLabel(e.kind)}</span>
                  <span className="text-xs text-neutral-400">{sceneCountOf(e.id)}</span>
                </button>
              </li>
            ))}
          </ul>

          <div className="pt-2 border-t border-neutral-200 space-y-2">
            <h4 className="text-xs font-semibold uppercase text-neutral-500">Add entity</h4>
            <div className="flex gap-2">
              <select
                aria-label="New entity kind"
                className="border border-neutral-300 rounded px-2 py-1 text-sm bg-white text-neutral-900"
                value={newKind}
                onChange={e => setNewKind(e.target.value as EntityKind)}
              >
                {ENTITY_KINDS.map(k => (
                  <option key={k} value={k}>
                    {kindLabel(k)}
                  </option>
                ))}
              </select>
              <input
                aria-label="New entity name"
                placeholder="Name"
                className="flex-1 min-w-0 border border-neutral-300 rounded px-2 py-1 text-sm bg-white text-neutral-900"
                value={newName}
                onChange={e => setNewName(e.target.value)}
              />
            </div>
            <button className={btn} data-testid="entity-add" disabled={!newName.trim()} onClick={addEntity}>
              Add
            </button>
          </div>
        </>
      )}

      {error && <p className="text-xs text-red-600">{error}</p>}
    </aside>
  );
}
