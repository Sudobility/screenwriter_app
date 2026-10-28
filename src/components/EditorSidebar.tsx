import { useEffect, useMemo, useState, type ComponentType, type ReactNode } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@sudobility/components";
import { MasterListItem } from "@sudobility/components";
import { ENTITY_KINDS, type EntityKind, type EntityView } from "@sudobility/writing_core";
import { defaultSpellingPolicy, Navigator, type ScriptEditorHost } from "@sudobility/writing_ui";
import {
  BoltIcon, BookOpenIcon, CalendarDaysIcon, CameraIcon, CogIcon, CubeIcon,
  FilmIcon, FireIcon, HomeIcon, ListBulletIcon, MapPinIcon, MusicalNoteIcon, PaintBrushIcon,
  PencilSquareIcon, PlusIcon, RectangleGroupIcon, ShieldCheckIcon, SparklesIcon, SpeakerWaveIcon,
  Squares2X2Icon, SwatchIcon, TagIcon, TruckIcon, UserPlusIcon, UsersIcon, WrenchIcon,
} from "@heroicons/react/24/outline";
import { useModelTick } from "../util/use-model-tick";
import { kindLabel } from "../util/entity-kind-labels";
import { sceneCountOf } from "../util/entity-scene-count";
import { getStages, stageLabel } from "../util/character-skeleton";
import { addSubplot, ensureStoryEntity, findStoryEntity, getSubplots, isStoryEntity } from "../util/story-info";
import { addNote, isNote, listNotes } from "../util/notes";

type IconCmp = ComponentType<{ className?: string }>;
type SpecialSection = "scenes" | "storyboards" | "story" | "notes" | "more";
/** The top-level nav is one of these, selected in the icon rail; the list beside it shows that section's items. */
type Section = SpecialSection | EntityKind;

/** Character/Location are always offered (the two kinds the script itself can harvest); every other kind only once
 * it has an entity, or via the rail's "+ More" item. */
const ALWAYS_KINDS: readonly EntityKind[] = ["character", "location"];

/** A line-art icon per entity kind for the rail; `CubeIcon` is the neutral fallback for the kinds without a
 * distinctive one. */
const KIND_ICONS: Partial<Record<EntityKind, IconCmp>> = {
  character: UsersIcon, location: MapPinIcon, prop: CubeIcon, wardrobe: SwatchIcon,
  makeupHair: SparklesIcon, vehicle: TruckIcon, animal: TagIcon, setDressing: HomeIcon,
  greenery: TagIcon, specialEffect: FireIcon, visualEffect: SparklesIcon, mechanicalEffect: CogIcon,
  stunt: BoltIcon, sound: SpeakerWaveIcon, music: MusicalNoteIcon, camera: CameraIcon,
  specialEquipment: WrenchIcon, backgroundActor: UserPlusIcon, security: ShieldCheckIcon,
  additionalLabor: WrenchIcon, animalHandler: TagIcon, artDepartment: PaintBrushIcon,
  unit: RectangleGroupIcon, scriptDay: CalendarDaysIcon, sequence: ListBulletIcon, misc: TagIcon,
};
const kindIcon = (k: EntityKind): IconCmp => KIND_ICONS[k] ?? CubeIcon;

const btn = "border border-neutral-300 rounded px-2 py-1 text-xs bg-white hover:bg-neutral-100 disabled:opacity-40 disabled:hover:bg-white";

/**
 * The editor's left navigation, in two levels (thruline.studio's shape, per an explicit user request): a vertical
 * icon rail on the left is the TOP level — Scenes (the Script Structure `Navigator`), Storyboards, Story, Notes,
 * then one line-art icon per visible entity kind (Character/Location always, any other kind once it has an entity),
 * then "+ More" to add another kind. Each rail item is an icon-only button with a tooltip (`title`/`aria-label`).
 * Selecting one shows that section's list in the panel to its right.
 *
 * Selecting an item in the list is still a real master/detail selection owned by `EditorPage`: an entity shows its
 * `EntityDetailView` in place of the script editor, a scene jumps the script, a storyboard scene its detail. The
 * rail's active section is this component's own browsing state, but it follows an externally-driven selection (Find
 * & Replace jumping to an entity, a freshly-created entity being auto-selected) so the right list is shown; clicking
 * the Scenes rail snaps the detail pane back to the script (`onShowScript`).
 *
 * A `character`-kind entity with life stages (`util/character-skeleton.ts`) renders as its own expandable branch in
 * the Characters list; the built-in "Story" record (`util/story-info.ts`) and Notes (`util/notes.ts`) each live in
 * their own section rather than as `misc` rows. `EditorPage` keeps this mounted continuously inside one
 * `MasterDetailLayout`, so it owns its expand/collapse state directly.
 */
export function EditorSidebar({
  host,
  selectedEntityId,
  selectedStageId,
  onSelectEntity,
  onJumpToScene,
  onShowScript,
  onSelectStoryboard,
  selectedStoryboardSceneId,
}: {
  host: ScriptEditorHost;
  selectedEntityId: string | null;
  selectedStageId: string | null;
  onSelectEntity(entityId: string, stageId?: string | null): void;
  onJumpToScene(elementId: string): void;
  onShowScript(): void;
  onSelectStoryboard(sceneId: string): void;
  selectedStoryboardSceneId: string | null;
}) {
  useModelTick(host);
  const [active, setActive] = useState<Section>("scenes");
  // List-internal expand/collapse only (character life-stage branches, the Plot branch's subplots) — the top-level
  // sections no longer fold; the rail switches between them.
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
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

  // The built-in "Story" record and Notes render in their own sections, never as normal (misc) Catalog rows.
  const all = host.model.entities().filter(e => !isStoryEntity(e) && !isNote(e));
  const notes = listNotes(host);
  const sceneCount = host.model.scenes().length;
  const storyEntity = findStoryEntity(host);
  const subplots = storyEntity ? getSubplots(storyEntity) : [];
  const plotOpen =
    expanded.has("__plot__") ||
    (!!storyEntity && selectedEntityId === storyEntity.id && (selectedStageId === "plot" || !!selectedStageId?.startsWith("subplot:")));
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
  const visibleKinds = ENTITY_KINDS.filter(k => ALWAYS_KINDS.includes(k) || (byKind.get(k)?.length ?? 0) > 0);
  const otherKinds = ENTITY_KINDS.filter(k => !visibleKinds.includes(k));

  // Follow an externally-driven selection so the rail shows the list the selected item lives in (Find & Replace
  // jumping to an entity, a just-created entity being auto-selected). An empty selection means the script is on
  // screen — leave the rail wherever the writer left it, so browsing a list while the script shows isn't disturbed.
  useEffect(() => {
    if (selectedStoryboardSceneId) {
      setActive("storyboards");
      return;
    }
    if (!selectedEntityId) return;
    const e = host.model.entity(selectedEntityId as never);
    if (!e) return;
    if (isStoryEntity(e)) setActive("story");
    else if (isNote(e)) setActive("notes");
    else setActive(e.kind);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedEntityId, selectedStoryboardSceneId, host]);

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
      const created = res.effects.find(e => e.kind === "entityCreated");
      if (created) onSelectEntity(created.id, null); // selecting it syncs the rail to this kind
    } else if (res.detail?.existingId) {
      setError(`An entity named "${trimmed}" already exists.`);
    }
  };

  // Picking a rail section. Scenes IS the script, so choosing it snaps the detail pane back to the editor; the
  // others only change which list is shown (the detail pane follows the item the writer then clicks).
  const selectSection = (key: Section) => {
    setActive(key);
    setError(null);
    if (key !== "more") {
      setPickingOtherKind(false);
      setOtherKind("");
      setOtherName("");
    }
    if (key === "scenes") onShowScript();
  };

  const railItems: { key: Section; label: string; Icon: IconCmp; count?: number }[] = [
    { key: "scenes", label: "Scenes", Icon: FilmIcon, count: sceneCount },
    { key: "storyboards", label: "Storyboards", Icon: Squares2X2Icon },
    { key: "story", label: "Story", Icon: BookOpenIcon },
    { key: "notes", label: "Notes", Icon: PencilSquareIcon, count: notes.length },
    ...visibleKinds.map(k => ({ key: k, label: kindLabel(k), Icon: kindIcon(k), count: byKind.get(k)?.length ?? 0 })),
  ];

  const railButton = (key: Section, label: string, Icon: IconCmp, count?: number) => (
    <button
      key={key}
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active === key}
      data-testid={`rail-${key}`}
      data-active={active === key}
      onClick={() => selectSection(key)}
      className={`relative w-9 h-9 flex items-center justify-center rounded shrink-0 ${
        active === key ? "bg-neutral-800 text-white" : "text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800"
      }`}
    >
      <Icon className="w-5 h-5" />
      {count ? (
        <span className="absolute -top-0.5 -right-0.5 min-w-[1rem] h-4 px-1 rounded-full bg-neutral-200 text-neutral-700 text-[10px] leading-4 text-center">
          {count}
        </span>
      ) : null}
    </button>
  );

  const sectionHeader = (label: string, right?: ReactNode) => (
    <div className="flex items-center gap-2 px-3 py-2 border-b border-neutral-100">
      <h3 className="flex-1 text-xs font-semibold uppercase text-neutral-500">{label}</h3>
      {right}
    </div>
  );

  const kindList = (k: EntityKind) => {
    const entities = byKind.get(k) ?? [];
    return (
      <div data-testid="catalog-kind-group" data-kind={k}>
        {sectionHeader(
          kindLabel(k),
          <>
            <span className="text-xs text-neutral-400">{entities.length}</span>
            {(k === "character" || k === "location") && (
              <button
                type="button"
                className="text-xs text-neutral-400 hover:text-neutral-700"
                title="Re-scan the script for character and location entities (harvesting only runs once when the editor opens; use this after adding a new character or scene heading)"
                onClick={() => run("entity.rebuild", {})}
              >
                Refresh
              </button>
            )}
            <button
              type="button"
              className="text-neutral-400 hover:text-neutral-700 px-1 text-base leading-none"
              title={`Add ${kindLabel(k)}`}
              onClick={() => {
                setAddingKind(k);
                setNewName("");
              }}
            >
              +
            </button>
          </>
        )}
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
                className="pl-4"
              />
            );
          }
          // Force it open while its subject (the character itself or one of its stages) is the current selection —
          // otherwise "+ Add Age" would select a stage the sidebar still shows as collapsed, and clicking a sibling
          // stage needs the branch open too.
          const branchOpen = expanded.has(en.id) || selectedEntityId === en.id;
          return (
            <div key={en.id}>
              <div
                className={`flex items-center gap-1 pl-4 pr-3 py-1.5 cursor-pointer hover:bg-neutral-100 ${
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
                    className="pl-10"
                  />
                ))}
            </div>
          );
        })}
        {addingKind === k && (
          <div className="flex gap-2 px-3 py-1.5">
            <input
              autoFocus
              spellCheck={defaultSpellingPolicy.entityName(k)}
              autoCorrect="off"
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
      </div>
    );
  };

  return (
    <div className="h-full flex min-h-0 text-sm" data-testid="editor-sidebar">
      <nav
        data-testid="sidebar-rail"
        aria-label="Sidebar sections"
        className="flex flex-col items-center gap-1 py-2 px-1 border-r border-neutral-200 shrink-0 overflow-y-auto bg-neutral-50"
      >
        {railItems.map(({ key, label, Icon, count }) => railButton(key, label, Icon, count))}
        {otherKinds.length > 0 && railButton("more", "Add other kind", PlusIcon)}
      </nav>

      <div data-testid="sidebar-list" className="flex-1 min-w-0 min-h-0 overflow-y-auto">
        {active === "scenes" && (
          <section data-testid="scenes-section">
            {sectionHeader(
              "Scenes",
              <span className="text-xs text-neutral-400">
                {sceneCount} {sceneCount === 1 ? "scene" : "scenes"}
              </span>
            )}
            <Navigator host={host} onJumpTo={onJumpToScene} />
          </section>
        )}

        {active === "storyboards" && (
          <section data-testid="storyboards-navigation">
            {sectionHeader("Storyboards")}
            {host.model.scenes().map((scene, index) => (
              <MasterListItem
                key={String(scene.id)}
                label={`${index + 1}. ${scene.headingText || "Untitled scene"}`}
                isSelected={selectedStoryboardSceneId === String(scene.id)}
                onClick={() => onSelectStoryboard(String(scene.id))}
                className="pl-4"
              />
            ))}
          </section>
        )}

        {active === "story" && (
          <div data-testid="catalog-story-group">
            {sectionHeader("Story")}
            <MasterListItem
              isSelected={!!storyEntity && selectedEntityId === storyEntity.id && selectedStageId === "theme"}
              onClick={() => openStoryItem("theme")}
              label="Theme"
              className="pl-4"
            />
            <MasterListItem
              isSelected={!!storyEntity && selectedEntityId === storyEntity.id && selectedStageId === "tagline"}
              onClick={() => openStoryItem("tagline")}
              label="Tagline"
              className="pl-4"
            />
            <MasterListItem
              isSelected={!!storyEntity && selectedEntityId === storyEntity.id && selectedStageId === "synopsis"}
              onClick={() => openStoryItem("synopsis")}
              label="Synopsis"
              className="pl-4"
            />
            <div>
              <div
                className={`flex items-center gap-1 pl-4 pr-3 py-1.5 cursor-pointer hover:bg-neutral-100 ${
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
                    className="pl-10"
                  />
                ))}
            </div>
          </div>
        )}

        {active === "notes" && (
          <div data-testid="catalog-notes-group">
            {sectionHeader(
              "Notes",
              <>
                <span className="text-xs text-neutral-400">{notes.length}</span>
                <button
                  type="button"
                  className="text-neutral-400 hover:text-neutral-700 px-1 text-base leading-none"
                  title="Add a note"
                  data-testid="note-add"
                  onClick={() => {
                    const id = addNote(host);
                    if (id) onSelectEntity(id, null);
                    else setError("Could not add a note.");
                  }}
                >
                  +
                </button>
              </>
            )}
            {notes.map(n => (
              <MasterListItem
                key={n.id}
                isSelected={selectedEntityId === n.id}
                onClick={() => onSelectEntity(n.id, null)}
                label={n.name}
                description={n.description.plain.trim().split("\n")[0]?.slice(0, 60) || "Empty"}
                className="pl-4"
              />
            ))}
          </div>
        )}

        {active !== "scenes" && active !== "storyboards" && active !== "story" && active !== "notes" && active !== "more" && kindList(active)}

        {active === "more" && (
          <div data-testid="catalog-other-group">
            {sectionHeader("Add other kind")}
            {pickingOtherKind ? (
              <div className="flex flex-col gap-2 px-3 py-2">
                <Select value={otherKind} onValueChange={v => setOtherKind(v as EntityKind)}>
                  <SelectTrigger aria-label="Other kind" data-testid="other-kind-select" className="w-full">
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
                  spellCheck={otherKind ? defaultSpellingPolicy.entityName(otherKind) : false}
                  autoCorrect="off"
                  aria-label="New entity name"
                  placeholder="Name"
                  className="w-full min-w-0 border border-neutral-300 rounded px-2 py-1 text-sm bg-white text-neutral-900"
                  value={otherName}
                  onChange={e => setOtherName(e.target.value)}
                />
                <button
                  className={btn}
                  disabled={!otherKind || !otherName.trim()}
                  onClick={() => {
                    if (otherKind) addEntity(otherKind, otherName, () => { setOtherName(""); setPickingOtherKind(false); setOtherKind(""); });
                  }}
                >
                  Add
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="w-full text-left px-3 py-2 text-xs text-neutral-500 hover:text-neutral-800 hover:bg-neutral-100"
                onClick={() => setPickingOtherKind(true)}
              >
                + Add other kind
              </button>
            )}
          </div>
        )}

        {error && <p className="px-3 py-1 text-xs text-red-600">{error}</p>}
      </div>
    </div>
  );
}
