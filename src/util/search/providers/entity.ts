import type { ScriptEditorHost } from "@sudobility/writing_ui";
import { matchRanges } from "../../find-replace";
import {
  SKELETON_SECTIONS,
  getOwnSkeleton,
  getStages,
  setOwnSkeletonField,
  setStageField,
  stageLabel,
} from "../../character-skeleton";
import { isNote } from "../../notes";
import {
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
} from "../../story-info";
import { afterMount, highlightInField } from "../highlight";
import type { SearchHit, SearchProvider } from "../types";

/** Band 3: Catalog entities come after the title page (0), script (1) and scene synopses (2). */
const BAND = 3;

const SKELETON_FIELDS: { key: string; label: string }[] = Object.values(SKELETON_SECTIONS).flatMap(s => s.fields.map(f => ({ key: f.key, label: f.label })));

type SheetKey = "characterSheet" | "locationSheet" | "propSheet";
const SHEET_BY_KIND: Record<string, { sheet: SheetKey; testId: string }> = {
  character: { sheet: "characterSheet", testId: "character-appearance" },
  location: { sheet: "locationSheet", testId: "location-appearance" },
  prop: { sheet: "propSheet", testId: "prop-appearance" },
};
const EMPTY_SHEET: Record<SheetKey, Record<string, unknown>> = {
  characterSheet: { description: "", looksImageId: null, selectedLook: null, sheetImageId: null },
  locationSheet: { description: "", looksImageId: null, selectedLook: null, timeImageIds: {} },
  propSheet: { description: "", looksImageId: null, selectedLook: null, sheetImageId: null },
};

type ImageRecord = { id: string; description: string };

/** What and where a hit is on an entity. `start`/`end` are plain offsets within that field's text. */
type EntityLoc =
  | { kind: "name"; entityId: string; start: number; end: number }
  | { kind: "description"; entityId: string; start: number; end: number }
  | { kind: "alias"; entityId: string; aliasValue: string; start: number; end: number }
  | { kind: "ownSkeleton"; entityId: string; fieldKey: string; start: number; end: number }
  | { kind: "stageSkeleton"; entityId: string; stageId: string; fieldKey: string; start: number; end: number }
  | { kind: "visualSheet"; entityId: string; sheet: SheetKey; testId: string; start: number; end: number }
  | { kind: "productionCaption"; entityId: string; imageId: string; start: number; end: number }
  | { kind: "storyboardCaption"; entityId: string; sceneId: string; imageId: string; start: number; end: number }
  | { kind: "story"; entityId: string; item: "theme" | "tagline" | "synopsis" | "plotMain"; start: number; end: number }
  | { kind: "subplotName"; entityId: string; subplotId: string; start: number; end: number }
  | { kind: "subplotText"; entityId: string; subplotId: string; start: number; end: number }
  | { kind: "noteTitle"; entityId: string; start: number; end: number }
  | { kind: "noteBody"; entityId: string; start: number; end: number };

/** Identity of the field a loc points at, ignoring the offset (for grouping Replace All by field). */
function fieldKeyOf(loc: EntityLoc): string {
  switch (loc.kind) {
    case "alias":
      return `${loc.entityId}:alias:${loc.aliasValue}`;
    case "ownSkeleton":
      return `${loc.entityId}:own:${loc.fieldKey}`;
    case "stageSkeleton":
      return `${loc.entityId}:stage:${loc.stageId}:${loc.fieldKey}`;
    case "visualSheet":
      return `${loc.entityId}:sheet:${loc.sheet}`;
    case "productionCaption":
      return `${loc.entityId}:prodimg:${loc.imageId}`;
    case "storyboardCaption":
      return `${loc.entityId}:sb:${loc.sceneId}:${loc.imageId}`;
    case "story":
      return `${loc.entityId}:story:${loc.item}`;
    case "subplotName":
      return `${loc.entityId}:subplot:${loc.subplotId}:name`;
    case "subplotText":
      return `${loc.entityId}:subplot:${loc.subplotId}:text`;
    default:
      return `${loc.entityId}:${loc.kind}`;
  }
}

/** The field's current full text, read fresh from the model. */
function currentText(host: ScriptEditorHost, loc: EntityLoc): string {
  const e = host.model.entity(loc.entityId as never);
  if (!e) return "";
  const fields = e.fields as Record<string, unknown>;
  switch (loc.kind) {
    case "name":
    case "noteTitle":
      return e.name;
    case "description":
    case "noteBody":
      return e.description.plain;
    case "alias":
      return loc.aliasValue;
    case "ownSkeleton":
      return getOwnSkeleton(e)[loc.fieldKey] ?? "";
    case "stageSkeleton":
      return getStages(e).find(s => s.id === loc.stageId)?.skeleton[loc.fieldKey] ?? "";
    case "visualSheet":
      return (fields[loc.sheet] as { description?: string } | undefined)?.description ?? "";
    case "productionCaption":
      return ((fields.productionImages as ImageRecord[] | undefined) ?? []).find(im => im.id === loc.imageId)?.description ?? "";
    case "storyboardCaption":
      return (((fields.storyboards as Record<string, ImageRecord[]> | undefined) ?? {})[loc.sceneId] ?? []).find(im => im.id === loc.imageId)?.description ?? "";
    case "story":
      return loc.item === "theme" ? getTheme(e) : loc.item === "tagline" ? getTagline(e) : loc.item === "synopsis" ? getSynopsis(e) : getPlotMain(e);
    case "subplotName":
      return getSubplots(e).find(s => s.id === loc.subplotId)?.name ?? "";
    case "subplotText":
      return getSubplots(e).find(s => s.id === loc.subplotId)?.text ?? "";
  }
}

/** Write a field's whole new text through the right command/helper. */
function writeField(host: ScriptEditorHost, loc: EntityLoc, text: string): boolean {
  const e = host.model.entity(loc.entityId as never);
  if (!e) return false;
  const fields = e.fields as Record<string, unknown>;
  const update = (patch: Record<string, unknown>) => host.execute([{ id: "entity.update", params: { entityId: e.id, patch } }], { kind: "local-command", groupKey: "find-replace" }).ok;
  switch (loc.kind) {
    case "name":
    case "noteTitle":
      return update({ name: text });
    case "description":
    case "noteBody":
      return update({ description: text });
    case "alias": {
      host.execute([{ id: "entity.removeAlias", params: { entityId: e.id, alias: loc.aliasValue } }], { kind: "local-command", groupKey: "find-replace" });
      const trimmed = text.trim();
      if (trimmed) host.execute([{ id: "entity.addAlias", params: { entityId: e.id, alias: trimmed } }], { kind: "local-command", groupKey: "find-replace" });
      return true;
    }
    case "ownSkeleton":
      setOwnSkeletonField(host, e, loc.fieldKey, text);
      return true;
    case "stageSkeleton":
      setStageField(host, e, loc.stageId, loc.fieldKey, text);
      return true;
    case "visualSheet": {
      const existing = (fields[loc.sheet] as Record<string, unknown> | undefined) ?? EMPTY_SHEET[loc.sheet];
      return update({ fields: { [loc.sheet]: { ...existing, description: text } } });
    }
    case "productionCaption": {
      const images = (fields.productionImages as ImageRecord[] | undefined) ?? [];
      return update({ fields: { productionImages: images.map(im => (im.id === loc.imageId ? { ...im, description: text } : im)) } });
    }
    case "storyboardCaption": {
      const all = (fields.storyboards as Record<string, ImageRecord[]> | undefined) ?? {};
      const arr = (all[loc.sceneId] ?? []).map(im => (im.id === loc.imageId ? { ...im, description: text } : im));
      return update({ fields: { storyboards: { ...all, [loc.sceneId]: arr } } });
    }
    case "story":
      (loc.item === "theme" ? setTheme : loc.item === "tagline" ? setTagline : loc.item === "synopsis" ? setSynopsis : setPlotMain)(host, e, text);
      return true;
    case "subplotName":
      setSubplotField(host, e, loc.subplotId, { name: text });
      return true;
    case "subplotText":
      setSubplotField(host, e, loc.subplotId, { text });
      return true;
  }
}

/** Searches and edits every Catalog surface: name/aliases/description, character skeleton (own + stages), the
 * visual-sheet appearance notes, production & storyboard image captions, the Story record and subplots, and notes. */
export function createEntityProvider(host: ScriptEditorHost, nav: { showEntity(entityId: string, stageOrKey: string | null): void; showStoryboard(sceneId: string): void }): SearchProvider {
  const build = (query: string, opts: Parameters<SearchProvider["find"]>[1]): SearchHit[] => {
    const hits: SearchHit[] = [];
    const list = host.model.entities();
    for (let ei = 0; ei < list.length; ei++) {
      const e = list[ei];
      const fields = e.fields as Record<string, unknown>;
      const add = (rank: number, surface: string, text: string, loc: (start: number, end: number) => EntityLoc) => {
        if (!text) return;
        for (const r of matchRanges(text, query, opts)) {
          const l = loc(r.start, r.end);
          hits.push({ id: `entity:${fieldKeyOf(l)}:${r.start}`, providerId: "entity", order: [BAND, ei, rank, r.start], text: text.slice(r.start, r.end), surface, loc: l });
        }
      };

      if (isStoryEntity(e)) {
        add(0, "Story · Theme", getTheme(e), (start, end) => ({ kind: "story", entityId: e.id, item: "theme", start, end }));
        add(1, "Story · Tagline", getTagline(e), (start, end) => ({ kind: "story", entityId: e.id, item: "tagline", start, end }));
        add(2, "Story · Synopsis", getSynopsis(e), (start, end) => ({ kind: "story", entityId: e.id, item: "synopsis", start, end }));
        add(3, "Story · Plot", getPlotMain(e), (start, end) => ({ kind: "story", entityId: e.id, item: "plotMain", start, end }));
        getSubplots(e).forEach((sub, si) => {
          const label = `Subplot · ${sub.name || "Untitled"}`;
          add(4 + si * 2, label, sub.name, (start, end) => ({ kind: "subplotName", entityId: e.id, subplotId: sub.id, start, end }));
          add(5 + si * 2, label, sub.text, (start, end) => ({ kind: "subplotText", entityId: e.id, subplotId: sub.id, start, end }));
        });
        const storyboards = (fields.storyboards as Record<string, ImageRecord[]> | undefined) ?? {};
        Object.entries(storyboards).forEach(([sceneId, images], bi) =>
          images.forEach((im, ii) => add(1000 + bi * 100 + ii, "Storyboard caption", im.description, (start, end) => ({ kind: "storyboardCaption", entityId: e.id, sceneId, imageId: im.id, start, end }))),
        );
        continue;
      }
      if (isNote(e)) {
        add(0, `Note · ${e.name}`, e.name, (start, end) => ({ kind: "noteTitle", entityId: e.id, start, end }));
        add(1, `Note · ${e.name}`, e.description.plain, (start, end) => ({ kind: "noteBody", entityId: e.id, start, end }));
        continue;
      }

      add(0, `${e.name} · Name`, e.name, (start, end) => ({ kind: "name", entityId: e.id, start, end }));
      if (e.kind === "character") {
        e.aliases.forEach((alias, ai) => add(1 + ai, `${e.name} · Alias`, alias, (start, end) => ({ kind: "alias", entityId: e.id, aliasValue: alias, start, end })));
        const sheet = SHEET_BY_KIND.character;
        add(8, `${e.name} · Appearance`, (fields[sheet.sheet] as { description?: string } | undefined)?.description ?? "", (start, end) => ({ kind: "visualSheet", entityId: e.id, sheet: sheet.sheet, testId: sheet.testId, start, end }));
        const own = getOwnSkeleton(e);
        SKELETON_FIELDS.forEach((f, idx) => add(10 + idx, `${e.name} · ${f.label}`, own[f.key] ?? "", (start, end) => ({ kind: "ownSkeleton", entityId: e.id, fieldKey: f.key, start, end })));
        getStages(e).forEach((st, sIdx) =>
          SKELETON_FIELDS.forEach((f, idx) =>
            add(100 + sIdx * 50 + idx, `${e.name} · Age ${stageLabel(st)} · ${f.label}`, st.skeleton[f.key] ?? "", (start, end) => ({ kind: "stageSkeleton", entityId: e.id, stageId: st.id, fieldKey: f.key, start, end })),
          ),
        );
      } else {
        add(5, `${e.name} · Description`, e.description.plain, (start, end) => ({ kind: "description", entityId: e.id, start, end }));
        const sheet = SHEET_BY_KIND[e.kind];
        if (sheet) add(6, `${e.name} · Appearance`, (fields[sheet.sheet] as { description?: string } | undefined)?.description ?? "", (start, end) => ({ kind: "visualSheet", entityId: e.id, sheet: sheet.sheet, testId: sheet.testId, start, end }));
        ((fields.productionImages as ImageRecord[] | undefined) ?? []).forEach((im, ii) =>
          add(300 + ii, `${e.name} · Image caption`, im.description, (start, end) => ({ kind: "productionCaption", entityId: e.id, imageId: im.id, start, end })),
        );
      }
    }
    return hits;
  };

  /** Find the target DOM node (after navigation) and highlight it; return false to keep polling. */
  const locate = (loc: EntityLoc): boolean => {
    if (loc.kind === "storyboardCaption") {
      const el = document.querySelector<HTMLElement>(`[data-image-id="${loc.imageId}"]`);
      if (!el) return false;
      highlightInField(el, loc.start, loc.end);
      return true;
    }
    const frame = document.querySelector<HTMLElement>('[data-testid="entity-detail"]');
    if (!frame) return false;
    if (loc.kind === "stageSkeleton" && frame.getAttribute("data-stage-id") !== loc.stageId) return false;
    if (loc.kind === "alias") {
      const span = Array.from(frame.querySelectorAll<HTMLElement>("[data-alias]")).find(s => s.getAttribute("data-alias") === loc.aliasValue);
      if (!span) {
        frame.scrollIntoView?.({ block: "center" });
        return true;
      }
      highlightInField(span, loc.start, loc.end);
      return true;
    }
    if (loc.kind === "productionCaption") {
      const el = frame.querySelector<HTMLElement>(`[data-image-id="${loc.imageId}"]`);
      if (!el) return false;
      highlightInField(el, loc.start, loc.end);
      return true;
    }
    const testId = loc.kind === "visualSheet" ? loc.testId : testIdOf(loc);
    const el = testId ? frame.querySelector<HTMLElement>(`[data-testid="${testId}"]`) : null;
    if (!el) {
      frame.scrollIntoView?.({ block: "center" });
      return true;
    }
    highlightInField(el, loc.start, loc.end, currentText(host, loc));
    return true;
  };

  const spliceOne = (loc: EntityLoc, replacement: string): boolean => {
    const text = currentText(host, loc);
    return writeField(host, loc, text.slice(0, loc.start) + replacement + text.slice(loc.end));
  };

  return {
    id: "entity",
    find: build,
    reveal(hit) {
      const loc = hit.loc as EntityLoc;
      if (loc.kind === "storyboardCaption") nav.showStoryboard(loc.sceneId);
      else {
        const stageOrKey =
          loc.kind === "stageSkeleton" ? loc.stageId : loc.kind === "story" ? (loc.item === "plotMain" ? "plot" : loc.item) : loc.kind === "subplotName" || loc.kind === "subplotText" ? `subplot:${loc.subplotId}` : null;
        nav.showEntity(loc.entityId, stageOrKey);
      }
      afterMount(() => locate(loc));
    },
    canReplace: () => true,
    replace(hit, replacement) {
      return spliceOne(hit.loc as EntityLoc, replacement);
    },
    replaceAll(hits, replacement) {
      const byField = new Map<string, EntityLoc[]>();
      for (const h of hits) {
        const loc = h.loc as EntityLoc;
        const k = fieldKeyOf(loc);
        (byField.get(k) ?? byField.set(k, []).get(k)!).push(loc);
      }
      for (const locs of byField.values()) {
        locs.sort((a, b) => b.start - a.start);
        let text = currentText(host, locs[0]);
        for (const loc of locs) text = text.slice(0, loc.start) + replacement + text.slice(loc.end);
        writeField(host, locs[0], text);
      }
    },
  };
}

/** The `data-testid` for the plain input/textarea kinds (visual-sheet/alias/caption kinds are located differently). */
function testIdOf(loc: EntityLoc): string {
  switch (loc.kind) {
    case "name":
      return "entity-name";
    case "description":
      return "entity-description";
    case "ownSkeleton":
    case "stageSkeleton":
      return `skeleton-field-${loc.fieldKey}`;
    case "story":
      return loc.item === "plotMain" ? "story-field-plot-main" : `story-field-${loc.item}`;
    case "subplotName":
      return "story-field-subplot-name";
    case "subplotText":
      return "story-field-subplot-text";
    case "noteTitle":
      return "note-title";
    case "noteBody":
      return "note-body";
    default:
      return "";
  }
}
