import { useEffect, useMemo, useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@sudobility/components";
import { MasterListItem } from "@sudobility/components/master-detail-layout";
import { ENTITY_KINDS, type EntityKind, type EntityView } from "@sudobility/writing_core";
import { Navigator, type ScriptEditorHost } from "@sudobility/writing_ui";
import { useModelTick } from "../util/use-model-tick";
import { kindLabel } from "../util/entity-kind-labels";
import { sceneCountOf } from "../util/entity-scene-count";

const DEFAULT_EXPANDED_KINDS: readonly EntityKind[] = ["character", "location"];
const btn = "border border-neutral-300 rounded px-2 py-1 text-xs bg-white hover:bg-neutral-100 disabled:opacity-40 disabled:hover:bg-white";

/**
 * The hierarchical sidebar (Storyist's "Project view" shape) — Script Structure (the existing,
 * untouched `Navigator`, unchanged — drag-reorder, synopsis editing, omit all still work exactly as
 * before) and Catalog (every `EntityKind` that has an entity, plus Character/Location always since
 * they're the two kinds the script itself can harvest, each an expand/collapse group of
 * `MasterListItem` rows). Selecting an entity here is a real master/detail selection — `EditorPage`
 * shows its detail (`EntityDetailView`) via `MasterDetailLayout` in place of the script editor.
 * `EditorPage` always wraps this in one `MasterDetailLayout` (fixed upstream in
 * `mail_box_components`'s `MasterDetailLayout` — it used to always mount a second, CSS-hidden copy of
 * both `masterContent`/`detailContent`, which broke a live `ScriptEditor` in `detailContent`; now the
 * desktop/mobile choice is JS-driven, so there is exactly one of each), so this component stays
 * mounted continuously and owns its own expand/collapse state directly — no more need to lift it up.
 *
 * Replaces the old `CatalogPanel.tsx` flyout entirely; see its retired doc comment history for the
 * `entity.*` command notes (unchanged, just relocated).
 */
export function EditorSidebar({
  host,
  selectedEntityId,
  onSelectEntity,
  onJumpToScene,
}: {
  host: ScriptEditorHost;
  selectedEntityId: string | null;
  onSelectEntity(entityId: string): void;
  onJumpToScene(elementId: string): void;
}) {
  useModelTick(host);
  const [expanded, setExpanded] = useState<Set<EntityKind>>(() => new Set(DEFAULT_EXPANDED_KINDS));
  const [addingKind, setAddingKind] = useState<EntityKind | null>(null);
  const [newName, setNewName] = useState("");
  const [pickingOtherKind, setPickingOtherKind] = useState(false);
  const [otherKind, setOtherKind] = useState<EntityKind | "">("");
  const [otherName, setOtherName] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Refresh character/location from the script once per mount, so a document that has never been
  // rebuilt doesn't show an empty Catalog the first time someone opens it. Harmless to repeat: a
  // no-op harvest leaves no Yjs transaction, so no undo-stack entry either.
  useEffect(() => {
    host.execute([{ id: "entity.rebuild", params: {} }], { kind: "local-command" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [host]);

  const all = host.model.entities();
  const byKind = useMemo(() => {
    const m = new Map<EntityKind, EntityView[]>();
    for (const e of all) m.set(e.kind, [...(m.get(e.kind) ?? []), e]);
    return m;
  }, [all]);
  // Character/location always show (the two harvestable kinds); every other kind only once it has an
  // entity — 24 always-visible, mostly-empty groups would be more than this ever needs to show at once.
  const visibleKinds = ENTITY_KINDS.filter(k => DEFAULT_EXPANDED_KINDS.includes(k) || (byKind.get(k)?.length ?? 0) > 0);
  const otherKinds = ENTITY_KINDS.filter(k => !visibleKinds.includes(k));

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

  const toggleKind = (k: EntityKind) =>
    setExpanded(cur => {
      const next = new Set(cur);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  const ensureExpanded = (k: EntityKind) => {
    if (!expanded.has(k)) toggleKind(k);
  };

  const addEntity = (kind: EntityKind, name: string, onDone: () => void) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const res = run("entity.create", { kind, name: trimmed });
    if (res.ok) {
      onDone();
      ensureExpanded(kind);
      const created = res.effects.find(e => e.kind === "entityCreated");
      if (created) onSelectEntity(created.id);
    } else if (res.detail?.existingId) {
      setError(`An entity named "${trimmed}" already exists.`);
    }
  };

  return (
    <div className="text-sm" data-testid="editor-sidebar">
      <section>
        <h3 className="px-3 pt-3 pb-1 text-xs font-semibold uppercase text-neutral-500">Script Structure</h3>
        <Navigator host={host} onJumpTo={onJumpToScene} />
      </section>

      <section className="border-t border-neutral-200 mt-2 pt-2" data-testid="catalog-tree">
        <div className="flex items-center px-3 pb-1">
          <h3 className="text-xs font-semibold uppercase text-neutral-500">Catalog</h3>
          <button
            type="button"
            className="ml-auto text-xs text-neutral-400 hover:text-neutral-700"
            title="Re-scan the script for character and location entities (harvesting only runs once when this opens; use this after adding a new character or scene heading)"
            onClick={() => run("entity.rebuild", {})}
          >
            Refresh
          </button>
        </div>
        {visibleKinds.map(k => {
          const entities = byKind.get(k) ?? [];
          const isOpen = expanded.has(k);
          return (
            <div key={k} data-testid="catalog-kind-group" data-kind={k}>
              <div className="flex items-center gap-1 px-3 py-1.5 hover:bg-neutral-100 cursor-pointer" onClick={() => toggleKind(k)}>
                <span className="text-neutral-400 w-3 shrink-0">{isOpen ? "▾" : "▸"}</span>
                <span className="flex-1 font-medium">{kindLabel(k)}</span>
                <span className="text-xs text-neutral-400">{entities.length}</span>
                <button
                  type="button"
                  className="text-neutral-400 hover:text-neutral-700 px-1"
                  title={`Add ${kindLabel(k)}`}
                  onClick={e => {
                    e.stopPropagation();
                    ensureExpanded(k);
                    setAddingKind(k);
                    setNewName("");
                  }}
                >
                  +
                </button>
              </div>
              {isOpen && (
                <>
                  {entities.map(en => (
                    <MasterListItem
                      key={en.id}
                      isSelected={selectedEntityId === en.id}
                      onClick={() => onSelectEntity(en.id)}
                      label={en.name}
                      description={`${sceneCountOf(host, en.id)} ${sceneCountOf(host, en.id) === 1 ? "scene" : "scenes"}`}
                      className="pl-8"
                    />
                  ))}
                  {addingKind === k && (
                    <div className="flex gap-2 px-3 py-1.5">
                      <input
                        autoFocus
                        aria-label={`New ${kindLabel(k)} name`}
                        placeholder="Name"
                        className="flex-1 min-w-0 border border-neutral-300 rounded px-2 py-1 text-sm bg-white text-neutral-900"
                        value={newName}
                        onChange={e => setNewName(e.target.value)}
                        onKeyDown={e => e.key === "Enter" && addEntity(k, newName, () => { setNewName(""); setAddingKind(null); })}
                      />
                      <button
                        className={btn}
                        data-testid="entity-add"
                        disabled={!newName.trim()}
                        onClick={() => addEntity(k, newName, () => { setNewName(""); setAddingKind(null); })}
                      >
                        Add
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          );
        })}

        {pickingOtherKind ? (
          <div className="flex gap-2 px-3 py-2">
            <Select value={otherKind} onValueChange={v => setOtherKind(v as EntityKind)}>
              <SelectTrigger aria-label="Other kind" data-testid="other-kind-select" className="flex-1">
                <SelectValue placeholder="Kind" />
              </SelectTrigger>
              <SelectContent>
                {otherKinds.map(k => (
                  <SelectItem key={k} value={k}>
                    {kindLabel(k)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <input
              aria-label="New entity name"
              placeholder="Name"
              className="flex-1 min-w-0 border border-neutral-300 rounded px-2 py-1 text-sm bg-white text-neutral-900"
              value={otherName}
              onChange={e => setOtherName(e.target.value)}
            />
            <button
              className={btn}
              disabled={!otherKind || !otherName.trim()}
              onClick={() => { if (otherKind) addEntity(otherKind, otherName, () => { setOtherName(""); setPickingOtherKind(false); setOtherKind(""); }); }}
            >
              Add
            </button>
          </div>
        ) : (
          otherKinds.length > 0 && (
            <button
              type="button"
              className="w-full text-left px-3 py-1.5 text-xs text-neutral-500 hover:text-neutral-800 hover:bg-neutral-100"
              onClick={() => setPickingOtherKind(true)}
            >
              + Add other kind
            </button>
          )
        )}
      </section>

      {error && <p className="px-3 py-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
