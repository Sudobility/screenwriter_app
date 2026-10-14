import { useState, type ReactNode } from "react";
import type { EntityKind } from "@sudobility/writing_core";
import { defaultSpellingPolicy, type ScriptEditorHost } from "@sudobility/writing_ui";
import { useModelTick } from "../util/use-model-tick";
import { kindLabel } from "../util/entity-kind-labels";
import { sceneCountOf } from "../util/entity-scene-count";
import { CharacterSkeletonEditor } from "./CharacterSkeletonEditor";
import {
  addAge,
  deleteStage,
  describeCharacterForImage,
  getOwnSkeleton,
  getStages,
  setOwnSkeleton,
  setOwnSkeletonField,
  setStageField,
  setStageSkeleton,
  stageLabel,
} from "../util/character-skeleton";
import { isNote } from "../util/notes";
import { hasParagraphs, printableFor, printDoc } from "../util/print-item";
import { GenerateSkeletonBox } from "./GenerateSkeletonBox";
import { PolishDialogueSection } from "./PolishDialogueSection";
import { CharacterSheetSection } from "./CharacterSheetSection";
import { LocationSheetSection } from "./LocationSheetSection";
import { PropSheetSection } from "./PropSheetSection";
import { ProductionImagesSection, type ProductionImage, type ProductionKind } from "./ProductionImagesSection";
import type { CharacterVisualState } from "@sudobility/screenwriter_types";
import type { LocationVisualState } from "@sudobility/screenwriter_types";
import type { PropVisualState } from "@sudobility/screenwriter_types";
import {
  addSubplot,
  deleteSubplot,
  getPlotMain,
  getSubplots,
  getSynopsis,
  getTagline,
  getTheme,
  isStoryEntity,
  setPlotMain,
  setSubplotField,
  setSynopsis,
  setTagline,
  setTheme,
} from "../util/story-info";

const btn = "border border-neutral-300 rounded px-2 py-1 text-sm bg-white hover:bg-neutral-100 disabled:opacity-40 disabled:hover:bg-white";

const SOURCE_LABEL: Record<"speaker" | "heading" | "tag", string> = { speaker: "Speaks", heading: "Scene heading", tag: "Tagged" };

function AddAgeButton({ onAdd }: { onAdd(): void }) {
  return (
    <button className={btn} data-testid="add-age" onClick={onAdd}>
      + Add Age
    </button>
  );
}

function AddSubplotButton({ onAdd }: { onAdd(): void }) {
  return (
    <button className={btn} data-testid="add-subplot" onClick={onAdd}>
      + Add subplot
    </button>
  );
}

/**
 * Fixed header-less frame every `EntityDetailView` return uses: a real three-region layout (per an
 * explicit user requirement), not the earlier `position: sticky` footer — sticky only pins once
 * scrolled *past* its natural position, so on a short skeleton (little content yet) it just sat right
 * after the last field instead of staying pinned to the bottom of the pane. `MasterDetailLayout`
 * already gives `detailContent`'s wrapper a definite `h-full` (itself inside its own `overflow-y-auto`,
 * see that repo's `MasterDetailLayout.tsx`), so this component's own `h-full flex flex-col` exactly
 * fills that space: the middle `overflow-y-auto` region is genuinely, independently scrollable, and
 * `footer` (present only on a `character`-kind entity) sits in normal flow at the bottom, always
 * visible, never scrolling away regardless of content length.
 */
function DetailFrame({ children, footer, dataStageId, actions }: { children: ReactNode; footer?: ReactNode; dataStageId?: string; actions?: ReactNode }) {
  return (
    <div className="h-full flex flex-col" data-testid="entity-detail" data-stage-id={dataStageId}>
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="max-w-5xl mx-auto p-6 space-y-4">
          {actions && <div className="flex justify-end -mb-2">{actions}</div>}
          {children}
        </div>
      </div>
      {footer && (
        <div className="shrink-0 border-t border-neutral-200 bg-white">
          <div className="max-w-5xl mx-auto px-6 py-3 flex justify-end">{footer}</div>
        </div>
      )}
    </div>
  );
}

/**
 * The master/detail layout's `detailContent` when a Catalog entity is selected in `EditorSidebar`
 * (instead of the script editor) — the same fields and `entity.*` commands `CatalogPanel.tsx` used to
 * show in its own flyout, relocated here: name (rename), kind + scene count, aliases (add/remove),
 * "Appears in" occurrences (`onJumpTo`, same jump mechanism as `Navigator`/`AiPanel`), delete with the
 * existing force-confirm flow.
 *
 * `character`-kind entities get a structured "skeleton" (Physical/Social/Psychological,
 * `CharacterSkeletonEditor`) instead of the generic plain-text description, and support multiple life
 * stages differentiated by age (see `util/character-skeleton.ts` for the data model/storage choice):
 * with no stages yet, the character's own skeleton is shown directly, with a fixed "+ Add Age" CTA
 * (`DetailFrame`'s `footer`); once staged, the character view instead lists its stages (each selectable
 * via `onSelectStage`, same as clicking one in the sidebar tree), and `stageId` (set instead) shows
 * that one stage's skeleton in a focused view — no name/aliases/occurrences there, those stay at the
 * character level.
 *
 * `EditorPage` passes `detailMaxWidth={0}` to its one `MasterDetailLayout` instance (the script editor
 * needs full bleed), so `MasterDetailLayout`'s own `detailMaxWidth`/`detailPadding` props aren't
 * available here — this view constrains and pads itself instead (`max-w-5xl`, matching
 * `ScreenContainer`'s own `maxWidth: "5xl"` convention, plus `p-6`).
 */
export function EntityDetailView({
  host,
  entityId,
  stageId,
  onJumpTo,
  onSelectStage,
  onDeleted,
  scriptTitle,
  documentId,
  projectId,
}: {
  host: ScriptEditorHost;
  entityId: string;
  /** The script's title, shown under the title of a printed item. */
  scriptTitle?: string;
  documentId: string;
  projectId: string;
  /** A specific life stage of this (character) entity, or `null` for the character itself. */
  stageId: string | null;
  onJumpTo(elementId: string): void;
  /** Select a different life stage of this same entity (or `null` to go back to the character itself). */
  onSelectStage(stageId: string | null): void;
  /** The entity was deleted (or no longer exists) — the caller clears the selection. */
  onDeleted(): void;
}) {
  useModelTick(host);
  const [error, setError] = useState<string | null>(null);
  const [deleteBlocked, setDeleteBlocked] = useState(false);
  const [stageDeletePending, setStageDeletePending] = useState(false);
  const [alias, setAlias] = useState("");
  const [nothingToPrint, setNothingToPrint] = useState(false);
  // Bumped when the AI fills in a skeleton, so the (uncontrolled) skeleton form remounts and shows the new values.
  const [skeletonVersion, setSkeletonVersion] = useState(0);

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

  // Print: for whatever of this item is written as paragraphs (a note, a description, a synopsis, a plot, a
  // skeleton). Read from the document at the moment of the click, after the field being typed in has been saved
  // (leaving it for the button saves it).
  const printButton = hasParagraphs(entity, stageId) ? (
    <span className="inline-flex items-center gap-2">
      {nothingToPrint && (
        <span role="status" data-testid="print-item-empty" className="text-xs text-neutral-500">
          Nothing written here yet.
        </span>
      )}
      <button
        className={`${btn} text-xs`}
        data-testid="print-item"
        title="Print this, or save it as a PDF"
        onClick={() => {
          const doc = printableFor(host, entity.id, stageId, scriptTitle);
          setNothingToPrint(!doc);
          if (doc) printDoc(doc);
        }}
      >
        Print
      </button>
    </span>
  ) : undefined;

  if (isStoryEntity(entity)) {
    // The built-in "Story" record (Plot/Theme/Tagline/Synopsis, see `util/story-info.ts`) — `stageId`
    // is repurposed here as the story item key ("theme" | "tagline" | "synopsis" | "plot" |
    // "subplot:<id>"), not a character life stage; no name/aliases/occurrences/delete for this
    // hidden container entity itself, only the item currently selected in the sidebar.
    const subplots = getSubplots(entity);
    const subplotId = stageId?.startsWith("subplot:") ? stageId.slice("subplot:".length) : null;
    const activeSubplot = subplotId ? subplots.find(s => s.id === subplotId) : undefined;
    if (subplotId && !activeSubplot) {
      onSelectStage(null);
      return null;
    }
    const key = activeSubplot ? "subplot" : (stageId ?? "theme");
    const fieldInput = "border border-neutral-300 rounded px-2 py-1 text-sm bg-white text-neutral-900 w-full";
    return (
      <DetailFrame actions={printButton} footer={key === "plot" || key === "subplot" ? <AddSubplotButton onAdd={() => onSelectStage(`subplot:${addSubplot(host, entity)}`)} /> : undefined}>
        <h3 className="text-xs font-semibold uppercase text-neutral-500">Story</h3>

        {key === "theme" && (
          <label className="flex flex-col text-xs text-neutral-500">
            Theme
            <input spellCheck autoCorrect="off" data-testid="story-field-theme" className={fieldInput} defaultValue={getTheme(entity)} key={entity.id} onBlur={e => setTheme(host, entity, e.target.value)} />
          </label>
        )}
        {key === "tagline" && (
          <label className="flex flex-col text-xs text-neutral-500">
            Tagline
            <input spellCheck autoCorrect="off" data-testid="story-field-tagline" className={fieldInput} defaultValue={getTagline(entity)} key={entity.id} onBlur={e => setTagline(host, entity, e.target.value)} />
          </label>
        )}
        {key === "synopsis" && (
          <label className="flex flex-col text-xs text-neutral-500">
            Synopsis
            <textarea
              spellCheck={true}
              autoCorrect="off"
              rows={10}
              data-testid="story-field-synopsis"
              className={fieldInput}
              defaultValue={getSynopsis(entity)}
              key={entity.id}
              onBlur={e => setSynopsis(host, entity, e.target.value)}
            />
          </label>
        )}
        {key === "plot" && (
          <label className="flex flex-col text-xs text-neutral-500">
            Main plot
            <textarea
              spellCheck={true}
              autoCorrect="off"
              rows={8}
              data-testid="story-field-plot-main"
              className={fieldInput}
              defaultValue={getPlotMain(entity)}
              key={entity.id}
              onBlur={e => setPlotMain(host, entity, e.target.value)}
            />
          </label>
        )}
        {activeSubplot && (
          <>
            <label className="flex flex-col text-xs text-neutral-500">
              Name
              <input
                spellCheck={true}
                autoCorrect="off"
                data-testid="story-field-subplot-name"
                className={fieldInput}
                defaultValue={activeSubplot.name}
                key={activeSubplot.id}
                onBlur={e => setSubplotField(host, entity, activeSubplot.id, { name: e.target.value.trim() || "Untitled subplot" })}
              />
            </label>
            <label className="flex flex-col text-xs text-neutral-500">
              Text
              <textarea
                spellCheck={true}
                autoCorrect="off"
                rows={8}
                data-testid="story-field-subplot-text"
                className={fieldInput}
                defaultValue={activeSubplot.text}
                key={`${activeSubplot.id}-text`}
                onBlur={e => setSubplotField(host, entity, activeSubplot.id, { text: e.target.value })}
              />
            </label>
            <div className="pt-2 border-t border-neutral-200">
              {stageDeletePending ? (
                <div className="space-y-2">
                  <p className="text-xs text-red-600">Delete this subplot? This cannot be undone.</p>
                  <div className="flex gap-2">
                    <button
                      className={`${btn} text-xs`}
                      onClick={() => {
                        deleteSubplot(host, entity, activeSubplot.id);
                        setStageDeletePending(false);
                        onSelectStage("plot");
                      }}
                    >
                      Delete subplot
                    </button>
                    <button className={`${btn} text-xs`} onClick={() => setStageDeletePending(false)}>
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button className={`${btn} text-xs`} onClick={() => setStageDeletePending(true)}>
                  Delete this subplot
                </button>
              )}
            </div>
          </>
        )}
      </DetailFrame>
    );
  }

  const isCharacter = entity.kind === "character";
  const isLocation = entity.kind === "location";
  const isProp = entity.kind === "prop";
  const productionKind = (["wardrobe", "makeupHair", "vehicle", "setDressing"] as const).find(kind => kind === entity.kind) as ProductionKind | undefined;
  const stages = isCharacter ? getStages(entity) : [];
  const stage = stageId ? stages.find(s => s.id === stageId) : undefined;
  if (stageId && !stage) {
    // The selected stage was deleted from under us (e.g. from another client) — fall back to the
    // character itself rather than showing a blank/broken stage view.
    onSelectStage(null);
    return null;
  }

  const occurrences = host.model.occurrences(entity.id);

  // Character-only (see the non-character branch below) — reused in two places (never both at once): a
  // standalone section when a staged character's "Life stages" list is shown (no skeleton on screen),
  // or — per an explicit user requirement — inside the Social section of the un-staged skeleton itself
  // (`socialExtra` below).
  const aliasesEditor = (
    <div>
      <h4 className="text-xs font-semibold uppercase text-neutral-500 mb-1">Aliases</h4>
      <ul className="space-y-1" data-testid="entity-aliases">
        {entity.aliases.map(a => (
          <li key={a} className="flex items-center gap-2 text-sm">
            <span className="flex-1" data-alias={a}>{a}</span>
            <button className={`${btn} text-xs`} onClick={() => run("entity.removeAlias", { entityId: entity.id, alias: a })}>
              Remove
            </button>
          </li>
        ))}
      </ul>
      <div className="flex gap-2 mt-2">
        <input
          spellCheck={false}
          autoCorrect="off"
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
  );

  const deleteEntity = (force: boolean) => {
    const res = run("entity.delete", { entityId: entity.id, ...(force ? { force: true } : {}) });
    if (res.ok) onDeleted();
    else if (!force && (res.detail?.tagIds || res.detail?.locationElementIds)) setDeleteBlocked(true);
  };

  if (stage) {
    // A single life stage: just its skeleton, no name/aliases/occurrences (those are character-level).
    return (
      <DetailFrame actions={printButton} dataStageId={stage.id} footer={<AddAgeButton onAdd={() => onSelectStage(addAge(host, entity))} />}>
        <div>
          <button className="text-xs text-blue-700 hover:underline" onClick={() => onSelectStage(null)}>
            &larr; {entity.name}
          </button>
          <p className="text-sm text-neutral-500 mt-1" data-testid="stage-heading">
            {entity.name} &middot; Age {stageLabel(stage)}
          </p>
        </div>

        <GenerateSkeletonBox
          existing={stage.skeleton}
          onApply={merged => {
            setStageSkeleton(host, entity, stage.id, merged);
            setSkeletonVersion(v => v + 1);
          }}
        />
        <CharacterSkeletonEditor
          key={`${stage.id}-${skeletonVersion}`}
          skeleton={stage.skeleton}
          onFieldCommit={(key, value) => setStageField(host, entity, stage.id, key, value)}
        />

        <div className="pt-2 border-t border-neutral-200">
          {stageDeletePending ? (
            <div className="space-y-2">
              <p className="text-xs text-red-600">Delete this life stage? This cannot be undone.</p>
              <div className="flex gap-2">
                <button
                  className={`${btn} text-xs`}
                  onClick={() => {
                    deleteStage(host, entity, stage.id);
                    setStageDeletePending(false);
                    onSelectStage(null);
                  }}
                >
                  Delete stage
                </button>
                <button className={`${btn} text-xs`} onClick={() => setStageDeletePending(false)}>
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button className={`${btn} text-xs`} onClick={() => setStageDeletePending(true)}>
              Delete this stage
            </button>
          )}
        </div>
      </DetailFrame>
    );
  }

  if (isNote(entity)) {
    // A note: a title and a body, nothing else. It is not something a scene "has", so no occurrences.
    return (
      <DetailFrame actions={printButton}>
        <label className="flex flex-col text-xs text-neutral-500">
          Title
          <input
            spellCheck={true}
            autoCorrect="off"
            data-testid="note-title"
            className="border border-neutral-300 rounded px-2 py-1 text-sm bg-white text-neutral-900"
            defaultValue={entity.name}
            key={entity.id}
            onBlur={e => e.target.value.trim() && e.target.value.trim() !== entity.name && run("entity.update", { entityId: entity.id, patch: { name: e.target.value.trim() } })}
          />
        </label>
        <p className="text-xs text-neutral-500">Note</p>
        <label className="flex flex-col text-xs text-neutral-500">
          Text
          <textarea
            spellCheck={true}
            autoCorrect="off"
            data-testid="note-body"
            rows={18}
            className="border border-neutral-300 rounded px-2 py-1 text-sm bg-white text-neutral-900"
            defaultValue={entity.description.plain}
            key={`${entity.id}-note`}
            onBlur={e => e.target.value !== entity.description.plain && run("entity.update", { entityId: entity.id, patch: { description: e.target.value } })}
          />
        </label>
        <div className="pt-2 border-t border-neutral-200">
          {stageDeletePending ? (
            <div className="space-y-2">
              <p className="text-xs text-red-600">Delete this note? This cannot be undone.</p>
              <div className="flex gap-2">
                <button
                  className={`${btn} text-xs`}
                  data-testid="note-delete-confirm"
                  onClick={() => {
                    setStageDeletePending(false);
                    if (run("entity.delete", { entityId: entity.id, force: true }).ok) onDeleted();
                  }}
                >
                  Delete note
                </button>
                <button className={`${btn} text-xs`} onClick={() => setStageDeletePending(false)}>
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button className={`${btn} text-xs`} data-testid="note-delete" onClick={() => setStageDeletePending(true)}>
              Delete this note
            </button>
          )}
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}
      </DetailFrame>
    );
  }

  return (
    <DetailFrame actions={printButton} footer={isCharacter ? <AddAgeButton onAdd={() => onSelectStage(addAge(host, entity))} /> : undefined}>
      <div>
        <label className="flex flex-col text-xs text-neutral-500">
          Name
          <input
            spellCheck={defaultSpellingPolicy.entityName(entity.kind as EntityKind)}
            autoCorrect="off"
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

      {isCharacter ? (
        stages.length > 0 ? (
          <>
            {aliasesEditor}
            <div>
              <h4 className="text-xs font-semibold uppercase text-neutral-500 mb-1">Life stages</h4>
              <ul className="space-y-1" data-testid="life-stages">
                {stages.map(s => (
                  <li key={s.id}>
                    <button className="text-sm text-blue-700 hover:underline" onClick={() => onSelectStage(s.id)}>
                      {stageLabel(s)}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </>
        ) : (
          <div>
            <h4 className="text-xs font-semibold uppercase text-neutral-500 mb-1">Skeleton</h4>
            <div className="mb-3">
              <GenerateSkeletonBox
                existing={getOwnSkeleton(entity)}
                onApply={merged => {
                  setOwnSkeleton(host, entity, merged);
                  setSkeletonVersion(v => v + 1);
                }}
              />
            </div>
            <CharacterSkeletonEditor
              key={`${entity.id}-${skeletonVersion}`}
              skeleton={getOwnSkeleton(entity)}
              onFieldCommit={(key, value) => setOwnSkeletonField(host, entity, key, value)}
              socialExtra={aliasesEditor}
            />
          </div>
        )
      ) : (
        <>
          {isLocation && (
            <div>
              <h4 className="text-xs font-semibold uppercase text-neutral-500 mb-1">Setting</h4>
              <div className="flex gap-2">
                {(["int", "ext"] as const).map(v => {
                  const selected = (entity.fields as Record<string, unknown>).setting === v;
                  return (
                    <button
                      key={v}
                      type="button"
                      data-testid={`location-setting-${v}`}
                      aria-pressed={selected}
                      className={`border rounded px-3 py-1 text-sm ${selected ? "bg-neutral-800 text-white border-neutral-800" : "border-neutral-300 bg-white hover:bg-neutral-100"}`}
                      onClick={() => run("entity.update", { entityId: entity.id, patch: { fields: { setting: selected ? null : v } } })}
                    >
                      {v === "int" ? "Interior (INT)" : "Exterior (EXT)"}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          {/* Aliases (alternate names an entity is known by) are only offered for Character — the one
              kind where that's a real, common concept (nicknames); it was never a deliberate choice
              for every other kind, just the generic fallback they all inherited by default. */}
          <div>
            <label className="flex flex-col text-xs text-neutral-500">
              Description
              <textarea
                spellCheck={true}
                autoCorrect="off"
                data-testid="entity-description"
                rows={3}
                className="border border-neutral-300 rounded px-2 py-1 text-sm bg-white text-neutral-900"
                defaultValue={entity.description.plain}
                key={`${entity.id}-desc`}
                onBlur={e => e.target.value !== entity.description.plain && run("entity.update", { entityId: entity.id, patch: { description: e.target.value } })}
              />
            </label>
          </div>
        </>
      )}

      {isCharacter && <CharacterSheetSection
        key={entity.id}
        documentId={documentId}
        characterId={entity.id}
        characterInfo={describeCharacterForImage(entity)}
        value={(entity.fields.characterSheet as CharacterVisualState | undefined) ?? null}
        onChange={value => run("entity.update", { entityId: entity.id, patch: { fields: { characterSheet: value } } })}
      />}
      {isLocation && <LocationSheetSection
        key={entity.id}
        documentId={documentId}
        locationId={entity.id}
        locationName={entity.name}
        value={(entity.fields.locationSheet as LocationVisualState | undefined) ?? null}
        onChange={value => run("entity.update", { entityId: entity.id, patch: { fields: { locationSheet: value } } })}
      />}
      {isProp && <PropSheetSection
        key={entity.id}
        documentId={documentId}
        propId={entity.id}
        value={(entity.fields.propSheet as PropVisualState | undefined) ?? null}
        onChange={value => run("entity.update", { entityId: entity.id, patch: { fields: { propSheet: value } } })}
      />}
      {productionKind && <ProductionImagesSection
        documentId={documentId}
        projectId={projectId}
        kind={productionKind}
        subjectId={entity.id}
        images={Array.isArray(entity.fields.productionImages) ? entity.fields.productionImages as ProductionImage[] : []}
        onChange={value => run("entity.update", { entityId: entity.id, patch: { fields: { productionImages: value } } })}
        characters={host.model.entities({ kind: "character" }).map(character => ({ id: character.id, name: character.name }))}
      />}
      {isCharacter && <PolishDialogueSection host={host} entity={entity} />}

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
    </DetailFrame>
  );
}
