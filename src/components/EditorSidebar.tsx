import { useEffect, useMemo, useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@sudobility/components";
import { MasterListItem } from "@sudobility/components/master-detail-layout";
import { ENTITY_KINDS, type EntityKind, type EntityView } from "@sudobility/writing_core";
import { Navigator, type ScriptEditorHost } from "@sudobility/writing_ui";
import { useModelTick } from "../util/use-model-tick";
import { kindLabel } from "../util/entity-kind-labels";
import { sceneCountOf } from "../util/entity-scene-count";
import { getStages, stageLabel } from "../util/character-skeleton";
import { addSubplot, ensureStoryEntity, findStoryEntity, getSubplots, isStoryEntity } from "../util/story-info";

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
 * A `character`-kind entity with life stages (`util/character-skeleton.ts`, added via `EntityDetailView`'s
 * "+ Add Age") renders as its own expandable branch instead of a plain leaf row: the character's own
 * row still selects the character (`onSelectEntity(id, null)`), a separate caret toggles its stage
 * list open, and each stage is its own nested `MasterListItem` (`onSelectEntity(id, stage.id)`).
 *
 * A pinned "Story" group sits above the kind-groups (Plot — one main plot plus 0..N subplots, added via
 * the branch's own "+" — Theme, Tagline, Synopsis), per an explicit user requirement: built-in items
 * under Catalog, not derived from `ENTITY_KINDS`/harvesting. `util/story-info.ts` backs all of it with
 * one hidden, auto-provisioned entity (`ensureStoryEntity`, filtered out of the normal kind-grouped
 * listing here) — `onSelectEntity`'s `stageId` slot is repurposed as the selected story item's key
 * ("theme" | "tagline" | "synopsis" | "plot" | "subplot:<id>") rather than a character life stage.
 *
 * Replaces the old `CatalogPanel.tsx` flyout entirely; see its retired doc comment history for the
 * `entity.*` command notes (unchanged, just relocated).
 */
export function EditorSidebar({
  host,
  selectedEntityId,
  selectedStageId,
  onSelectEntity,
  onJumpToScene,
}: {
  host: ScriptEditorHost;
  selectedEntityId: string | null;
  selectedStageId: string | null;
  onSelectEntity(entityId: string, stageId?: string | null): void;
  onJumpToScene(elementId: string): void;
}) {
  useModelTick(host);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(DEFAULT_EXPANDED_KINDS));
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
    ensureStoryEntity(host);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [host]);

  // The built-in "Story" record is rendered in its own pinned group below, never as a normal Catalog
  // (misc) row.
  const all = host.model.entities().filter(e => !isStoryEntity(e));
  const storyEntity = findStoryEntity(host);
  const subplots = storyEntity ? getSubplots(storyEntity) : [];
  const storyOpen = expanded.has("__story__");
  const plotOpen = expanded.has("__plot__") || (storyEntity && selectedEntityId === storyEntity.id && (selectedStageId === "plot" || selectedStageId?.startsWith("subplot:")));
  const openStoryItem = (key: string) => {
    ensureStoryEntity(host);
    const e = findStoryEntity(host);
    if (e) onSelectEntity(e.id, key);
  };
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

  const toggle = (key: string) =>
    setExpanded(cur => {
      const next = new Set(cur);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const ensureExpanded = (key: string) => {
    if (!expanded.has(key)) toggle(key);
  };

  const addEntity = (kind: EntityKind, name: string, onDone: () => void) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const res = run("entity.create", { kind, name: trimmed });
    if (res.ok) {
      onDone();
      ensureExpanded(kind);
      const created = res.effects.find(e => e.kind === "entityCreated");
      if (created) onSelectEntity(created.id, null);
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

        {/* Built-in story-bible items (Plot — one main plot, 0..N subplots — Theme, Tagline, Synopsis),
            per an explicit user requirement: "under Catalog", not their own top-level sidebar section,
            and not derived from `ENTITY_KINDS`/harvesting like the kind-groups below — a single hidden
            entity holds them all (`util/story-info.ts`), pinned here so it's always first. */}
        <div data-testid="catalog-story-group">
          <div className="flex items-center gap-1 px-3 py-1.5 hover:bg-neutral-100 cursor-pointer" onClick={() => toggle("__story__")}>
            <span className="text-neutral-400 w-3 shrink-0">{storyOpen ? "▾" : "▸"}</span>
            <span className="flex-1 font-medium">Story</span>
          </div>
          {storyOpen && (
            <>
              <MasterListItem
                isSelected={!!storyEntity && selectedEntityId === storyEntity.id && selectedStageId === "theme"}
                onClick={() => openStoryItem("theme")}
                label="Theme"
                className="pl-8"
              />
              <MasterListItem
                isSelected={!!storyEntity && selectedEntityId === storyEntity.id && selectedStageId === "tagline"}
                onClick={() => openStoryItem("tagline")}
                label="Tagline"
                className="pl-8"
              />
              <MasterListItem
                isSelected={!!storyEntity && selectedEntityId === storyEntity.id && selectedStageId === "synopsis"}
                onClick={() => openStoryItem("synopsis")}
                label="Synopsis"
                className="pl-8"
              />
              <div>
                <div
                  className={`flex items-center gap-1 pl-8 pr-3 py-1.5 cursor-pointer hover:bg-neutral-100 ${
                    storyEntity && selectedEntityId === storyEntity.id && selectedStageId === "plot" ? "bg-neutral-100 font-medium" : ""
                  }`}
                  onClick={() => openStoryItem("plot")}
                >
                  <button
                    type="button"
                    className="text-neutral-400 w-3 shrink-0"
                    onClick={e => {
                      e.stopPropagation();
                      toggle("__plot__");
                    }}
                  >
                    {plotOpen ? "▾" : "▸"}
                  </button>
                  <span className="flex-1">Plot</span>
                  <button
                    type="button"
                    className="text-neutral-400 hover:text-neutral-700 px-1"
                    title="Add subplot"
                    onClick={e => {
                      e.stopPropagation();
                      ensureExpanded("__plot__");
                      const e2 = findStoryEntity(host);
                      if (e2) onSelectEntity(e2.id, `subplot:${addSubplot(host, e2)}`);
                    }}
                  >
                    +
                  </button>
                </div>
                {plotOpen &&
                  subplots.map(s => (
                    <MasterListItem
                      key={s.id}
                      isSelected={!!storyEntity && selectedEntityId === storyEntity.id && selectedStageId === `subplot:${s.id}`}
                      onClick={() => openStoryItem(`subplot:${s.id}`)}
                      label={s.name || "Untitled subplot"}
                      className="pl-14"
                    />
                  ))}
              </div>
            </>
          )}
        </div>

        {visibleKinds.map(k => {
          const entities = byKind.get(k) ?? [];
          const isOpen = expanded.has(k);
          return (
            <div key={k} data-testid="catalog-kind-group" data-kind={k}>
              <div className="flex items-center gap-1 px-3 py-1.5 hover:bg-neutral-100 cursor-pointer" onClick={() => toggle(k)}>
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
                  {entities.map(en => {
                    const stages = k === "character" ? getStages(en) : [];
                    if (stages.length === 0) {
                      return (
                        <MasterListItem
                          key={en.id}
                          isSelected={selectedEntityId === en.id && !selectedStageId}
                          onClick={() => onSelectEntity(en.id, null)}
                          label={en.name}
                          description={`${sceneCountOf(host, en.id)} ${sceneCountOf(host, en.id) === 1 ? "scene" : "scenes"}`}
                          className="pl-8"
                        />
                      );
                    }
                    // Force it open while its subject (the character itself or one of its stages) is
                    // the current selection — otherwise "+ Add Age" would select a stage the sidebar
                    // still shows as collapsed, and clicking a sibling stage needs the branch open too.
                    const branchOpen = expanded.has(en.id) || selectedEntityId === en.id;
                    return (
                      <div key={en.id}>
                        <div
                          className={`flex items-center gap-1 pl-8 pr-3 py-1.5 cursor-pointer hover:bg-neutral-100 ${
                            selectedEntityId === en.id && !selectedStageId ? "bg-neutral-100 font-medium" : ""
                          }`}
                          onClick={() => onSelectEntity(en.id, null)}
                        >
                          <button
                            type="button"
                            className="text-neutral-400 w-3 shrink-0"
                            onClick={e => {
                              e.stopPropagation();
                              toggle(en.id);
                            }}
                          >
                            {branchOpen ? "▾" : "▸"}
                          </button>
                          <span className="flex-1">{en.name}</span>
                        </div>
                        {branchOpen &&
                          stages.map(s => (
                            <MasterListItem
                              key={s.id}
                              isSelected={selectedEntityId === en.id && selectedStageId === s.id}
                              onClick={() => onSelectEntity(en.id, s.id)}
                              label={stageLabel(s)}
                              className="pl-14"
                            />
                          ))}
                      </div>
                    );
                  })}
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
