import type { EntityView } from "@sudobility/writing_core";
import type { ScriptEditorHost } from "@sudobility/writing_ui";
import type { PastedCharacter, SmartPastePlotsResult } from "@sudobility/screenwriter_types";
import {
  characterAttributes,
  getOwnSkeleton,
  getStages,
  mergeSkeleton,
  newStage,
  setOwnSkeleton,
  setStages,
  type CharacterStage,
  type Skeleton,
} from "./character-skeleton";
import { ensureStoryEntity, findStoryEntity, getPlotMain, getSubplots, newSubplot, setPlots, type Subplot } from "./story-info";

/**
 * Smart Paste: what the AI found in the pasted text, laid against what the document already has. Planning is pure
 * (it reads the model and says what WOULD change, for the preview); applying plans again from the live document and
 * writes through ordinary commands, so it is undoable, syncs, and never works from a stale preview.
 *
 * The rule everywhere is the one `mergeSkeleton` set: what the writer wrote is kept, only blanks are filled.
 */

const nameKey = (name: string): string => name.trim().replace(/\s+/g, " ").toLowerCase();

/** Ages match on their number ("61", "61 years old", "about 61"); an age with no number matches on its words. */
export const ageKey = (age: string | undefined): string => {
  const a = (age ?? "").trim().toLowerCase();
  return /\d+/.exec(a)?.[0] ?? a;
};

const hasContent = (s: Skeleton): boolean => Object.values(s).some(v => typeof v === "string" && v.trim());

// ---- Characters ----

export interface StageChange {
  age: string;
  /** `new`: a life stage (or the skeleton of a new character) is added; `fill`: blanks of an existing one are filled; `same`: nothing to add. */
  kind: "new" | "fill" | "same";
  /** The skeleton keys that receive a value. */
  filled: string[];
}

export interface CharacterPlan {
  /** The name as pasted. */
  name: string;
  /** The character it matches in the document (by name or alias), if any. */
  entityId: string | null;
  existingName: string | null;
  newAliases: string[];
  stages: StageChange[];
  /** False when applying would change nothing. */
  changes: boolean;
}

interface Resolved {
  plan: CharacterPlan;
  entity: EntityView | null;
  /** The character's own skeleton after applying; null when it is (or becomes) staged. */
  own: Skeleton | null;
  /** The life stages after applying; null when the character stays un-staged. */
  stages: CharacterStage[] | null;
}

export function findCharacter(host: ScriptEditorHost, pasted: Pick<PastedCharacter, "name" | "aliases">): EntityView | null {
  const wanted = new Set([pasted.name, ...pasted.aliases].map(nameKey));
  const all = host.model.entities({ kind: "character" });
  // The name itself first: an alias of one character must not steal another character's own name.
  return (
    all.find(e => nameKey(e.name) === nameKey(pasted.name)) ??
    all.find(e => wanted.has(nameKey(e.name)) || (e.aliases ?? []).some(a => wanted.has(nameKey(a)))) ??
    null
  );
}

function resolveCharacter(host: ScriptEditorHost, pasted: PastedCharacter): Resolved {
  const entity = findCharacter(host, pasted);
  const pastedStages = pasted.stages as Skeleton[];
  const changes: StageChange[] = [];

  const known = new Set(entity ? [entity.name, ...(entity.aliases ?? [])].map(nameKey) : [nameKey(pasted.name)]);
  const newAliases = [...(entity && !known.has(nameKey(pasted.name)) ? [pasted.name] : []), ...pasted.aliases].filter(
    (a, i, list) => !known.has(nameKey(a)) && list.findIndex(b => nameKey(b) === nameKey(a)) === i
  );

  let own: Skeleton | null = null;
  let stages: CharacterStage[] | null = null;

  const intoStages = (list: CharacterStage[], blankFirst: boolean) => {
    for (const [i, p] of pastedStages.entries()) {
      // A first stage that has no age yet takes the first pasted age rather than standing beside it.
      const at = list.findIndex((s, j) => (s.skeleton.age?.trim() ? ageKey(s.skeleton.age) === ageKey(p.age) : blankFirst && i === 0 && j === 0));
      if (at < 0) {
        list.push(newStage({ ...p }));
        changes.push({ age: p.age ?? "", kind: "new", filled: Object.keys(p) });
        continue;
      }
      const merged = mergeSkeleton(list[at]!.skeleton, p);
      list[at] = { ...list[at]!, skeleton: merged.skeleton };
      changes.push({ age: merged.skeleton.age ?? "", kind: merged.filled.length ? "fill" : "same", filled: merged.filled });
    }
    return list;
  };

  if (!entity) {
    if (pastedStages.length === 1) own = { ...pastedStages[0]! };
    else stages = pastedStages.map(p => newStage({ ...p }));
    for (const p of pastedStages) changes.push({ age: p.age ?? "", kind: "new", filled: Object.keys(p) });
  } else {
    const existing = getStages(entity);
    if (existing.length > 0) {
      stages = intoStages(existing.map(s => ({ ...s, skeleton: { ...s.skeleton } })), false);
    } else if (pastedStages.length === 1) {
      const merged = mergeSkeleton(getOwnSkeleton(entity), pastedStages[0]!);
      own = merged.skeleton;
      changes.push({ age: merged.skeleton.age ?? "", kind: merged.filled.length ? "fill" : "same", filled: merged.filled });
    } else {
      // Several ages for a character that has none yet: what the writer already wrote becomes the first stage.
      const current = getOwnSkeleton(entity);
      stages = intoStages(hasContent(current) ? [newStage({ ...current })] : [], true);
    }
  }

  const plan: CharacterPlan = {
    name: pasted.name,
    entityId: entity ? String(entity.id) : null,
    existingName: entity?.name ?? null,
    newAliases,
    stages: changes,
    changes: !entity || newAliases.length > 0 || changes.some(c => c.kind !== "same"),
  };
  return { plan, entity, own, stages };
}

export function planCharacters(host: ScriptEditorHost, pasted: PastedCharacter[]): CharacterPlan[] {
  return pasted.map(p => resolveCharacter(host, p).plan);
}

export interface ApplyCharactersResult {
  created: string[];
  updated: string[];
  unchanged: string[];
  failed: string[];
  /** The first character written, to select it afterwards. */
  firstEntityId: string | null;
}

const local = { kind: "local-command" } as const;

export function applyCharacters(host: ScriptEditorHost, pasted: PastedCharacter[]): ApplyCharactersResult {
  const out: ApplyCharactersResult = { created: [], updated: [], unchanged: [], failed: [], firstEntityId: null };
  for (const p of pasted) {
    // Resolved against the document as it is NOW: an earlier character in this same batch may have changed it.
    const r = resolveCharacter(host, p);
    if (!r.entity) {
      const skeletons = r.stages ? r.stages.map(s => s.skeleton) : r.own ? [r.own] : [];
      const res = host.execute(
        [{ id: "entity.create", params: { kind: "character", name: p.name, aliases: r.plan.newAliases, attributes: characterAttributes(skeletons) } }],
        local
      );
      if (!res.ok) {
        out.failed.push(p.name);
        continue;
      }
      out.created.push(p.name);
      out.firstEntityId ??= findCharacter(host, p)?.id ?? null;
      continue;
    }
    if (!r.plan.changes) {
      out.unchanged.push(r.entity.name);
      continue;
    }
    const wrote = r.plan.stages.some(c => c.kind !== "same");
    const res = !wrote ? { ok: true } : r.stages ? setStages(host, r.entity, r.stages) : setOwnSkeleton(host, r.entity, r.own ?? {});
    if (res && !res.ok) {
      out.failed.push(r.entity.name);
      continue;
    }
    for (const alias of r.plan.newAliases) host.execute([{ id: "entity.addAlias", params: { entityId: r.entity.id, alias } }], local);
    out.updated.push(r.entity.name);
    out.firstEntityId ??= String(r.entity.id);
  }
  return out;
}

// ---- Plots ----

export interface PlotChange {
  /** `main` or the subplot's name. */
  name: string;
  main: boolean;
  /** `new`: added; `fill`: an existing, empty one receives the text; `kept`: the writer's own text stays. */
  kind: "new" | "fill" | "kept";
  text: string;
}

interface ResolvedPlots {
  changes: PlotChange[];
  plotMain?: string;
  subplots?: Subplot[];
}

function resolvePlots(host: ScriptEditorHost, pasted: SmartPastePlotsResult): ResolvedPlots {
  const story = findStoryEntity(host);
  const changes: PlotChange[] = [];
  const out: ResolvedPlots = { changes };

  if (pasted.mainPlot?.trim()) {
    const has = story ? getPlotMain(story).trim() : "";
    if (!has) out.plotMain = pasted.mainPlot.trim();
    changes.push({ name: "Main plot", main: true, kind: has ? "kept" : "fill", text: pasted.mainPlot.trim() });
  }

  const subplots = story ? getSubplots(story).map(s => ({ ...s })) : [];
  let touched = false;
  for (const p of pasted.subplots) {
    const at = subplots.findIndex(s => nameKey(s.name) === nameKey(p.name));
    if (at < 0) {
      subplots.push(newSubplot(p.name, p.text));
      changes.push({ name: p.name, main: false, kind: "new", text: p.text });
      touched = true;
    } else if (!subplots[at]!.text.trim()) {
      subplots[at] = { ...subplots[at]!, text: p.text };
      changes.push({ name: subplots[at]!.name, main: false, kind: "fill", text: p.text });
      touched = true;
    } else {
      changes.push({ name: subplots[at]!.name, main: false, kind: "kept", text: p.text });
    }
  }
  if (touched) out.subplots = subplots;
  return out;
}

export function planPlots(host: ScriptEditorHost, pasted: SmartPastePlotsResult): PlotChange[] {
  return resolvePlots(host, pasted).changes;
}

/** Returns what was written; `kept` items are left as the writer wrote them. */
export function applyPlots(host: ScriptEditorHost, pasted: SmartPastePlotsResult): PlotChange[] {
  ensureStoryEntity(host);
  const r = resolvePlots(host, pasted);
  const story = findStoryEntity(host);
  if (story) setPlots(host, story, { plotMain: r.plotMain, subplots: r.subplots });
  return r.changes;
}
