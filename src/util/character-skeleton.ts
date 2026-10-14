import type { EntityView } from "@sudobility/writing_core";
import type { ScriptEditorHost } from "@sudobility/writing_ui";

/**
 * A character's "bone structure" (Egri's three-dimensional-character worksheet: physical, social,
 * psychological), per an explicit user requirement. Flat `key -> text` map; every field is optional
 * except `age`. Field keys are unique across all three sections, so one flat object is enough — no
 * need to nest per section.
 */
export type Skeleton = Record<string, string>;

export interface CharacterStage {
  id: string;
  skeleton: Skeleton;
}

export type SkeletonSection = "physical" | "social" | "psychological";

export interface SkeletonFieldDef {
  key: string;
  label: string;
  /** Only `age` is required. */
  required?: boolean;
  multiline?: boolean;
  /** Groups a run of adjacent fields under a small subheading (Egri's "noticed first / secret /
   * noticed last" triad reads as one idea, not three unrelated questions). */
  group?: string;
}

export const SKELETON_SECTIONS: Record<SkeletonSection, { title: string; fields: SkeletonFieldDef[] }> = {
  physical: {
    title: "Physical",
    fields: [
      { key: "age", label: "Age", required: true },
      { key: "race", label: "Race" },
      { key: "height", label: "Height" },
      { key: "weight", label: "Weight" },
      { key: "appearance", label: "Appearance", multiline: true },
      { key: "sexOrientationExperience", label: "Sex, orientation, experience" },
      { key: "posture", label: "Posture" },
      { key: "unusualCharacteristics", label: "Unusual characteristics", multiline: true },
      { key: "health", label: "Health" },
    ],
  },
  social: {
    title: "Social",
    fields: [
      { key: "occupationAndAttitude", label: "Occupation and attitude", multiline: true },
      { key: "education", label: "Education" },
      { key: "money", label: "Money" },
      { key: "class", label: "Class" },
      { key: "relationships", label: "Relationships", multiline: true },
      { key: "homeLife", label: "Home life", multiline: true },
      { key: "religion", label: "Religion" },
      { key: "placeInCommunity", label: "Place in community" },
      { key: "politics", label: "Politics" },
      { key: "interests", label: "Interests", multiline: true },
    ],
  },
  psychological: {
    title: "Psychological",
    fields: [
      { key: "attitudeTowardLife", label: "Attitude toward life", multiline: true },
      { key: "moralStandard", label: "Moral standard" },
      { key: "intelligence", label: "Intelligence" },
      { key: "ambitions", label: "Ambitions", multiline: true },
      { key: "frustrations", label: "Frustrations", multiline: true },
      { key: "fearsAndObsessions", label: "Fears and obsessions", multiline: true },
      { key: "extrovertOrIntrovert", label: "Extrovert or introvert" },
      { key: "specialQualities", label: "Special qualities", multiline: true },
      { key: "proudestAchievement", label: "Proudest achievement", multiline: true },
      { key: "greatestSorrow", label: "Greatest sorrow", multiline: true },
      { key: "greatestShame", label: "Greatest shame", multiline: true },
      { key: "noticedFirst", label: "Noticed first", group: "Historical framing" },
      { key: "secret", label: "Secret", group: "Historical framing" },
      { key: "noticedLast", label: "Noticed last", group: "Historical framing" },
      { key: "coreContradictions", label: "Core contradictions", multiline: true },
      { key: "deepestDesire", label: "Deepest desire", multiline: true },
    ],
  },
};

const SKELETON_ATTR = "character.skeleton";
const STAGES_ATTR = "character.stages";

/** No `writing_core` schema/command changes needed for any of this — `EntityJSON.attributes` is
 * already a generic, per-entity `Record<string, JsonValue>` bag (dotted keys, arbitrary nested JSON),
 * round-tripped as plain JS via `entity.update`'s existing `attributes` patch. Storing stages as an
 * embedded array here (rather than as separate `character`-kind entities with a `parentId`, mirroring
 * `LocationFields.parentId`) sidesteps a real bug that approach would hit: entity names are deduped
 * globally per kind (`entity.create`'s `findByKey`), so two different characters' same-aged stage
 * (e.g. two "50"s) would collide if each stage were its own top-level `character` entity. */
export function getOwnSkeleton(entity: EntityView): Skeleton {
  const raw = entity.attributes?.[SKELETON_ATTR];
  return raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as unknown as Skeleton) : {};
}

export function getStages(entity: EntityView): CharacterStage[] {
  const raw = entity.attributes?.[STAGES_ATTR];
  return Array.isArray(raw) ? (raw as unknown as CharacterStage[]) : [];
}

export function stageLabel(stage: CharacterStage): string {
  return stage.skeleton.age?.trim() || "New";
}

/** A new life stage holding `skeleton`. */
export function newStage(skeleton: Skeleton = {}): CharacterStage {
  return { id: newStageId(), skeleton };
}

/** The attributes a new character is created with: one skeleton is the character's own, several are life stages. */
export function characterAttributes(skeletons: Skeleton[]): Record<string, unknown> {
  if (skeletons.length === 0) return {};
  return skeletons.length === 1 ? { [SKELETON_ATTR]: skeletons[0] } : { [STAGES_ATTR]: skeletons.map(newStage) };
}

/** Replace the whole list of life stages; the un-staged skeleton is removed, as it is when "Add Age" makes the first stage. */
export function setStages(host: ScriptEditorHost, entity: EntityView, stages: CharacterStage[]) {
  return run(host, entity.id, { [STAGES_ATTR]: stages.length > 0 ? stages : null, [SKELETON_ATTR]: null });
}

function newStageId(): string {
  return `stg_${Math.random().toString(36).slice(2, 10)}`;
}

function run(host: ScriptEditorHost, entityId: string, attributes: Record<string, unknown>) {
  return host.execute([{ id: "entity.update", params: { entityId, patch: { attributes } } }], { kind: "local-command" });
}

/**
 * The "Add Age" CTA. First call on a character with no stages yet: its own (un-staged) skeleton
 * becomes stage 1 (keeping whatever age/fields it already had), a second, blank stage ("New") is
 * appended, and the now-redundant un-staged skeleton attribute is removed — the character becomes a
 * branch in the sidebar tree from here on. A later call on an already-staged character just appends
 * one more blank stage. Returns the new (blank) stage's id, so the caller can select it.
 */
export function addAge(host: ScriptEditorHost, entity: EntityView): string {
  const existing = getStages(entity);
  const stages: CharacterStage[] =
    existing.length > 0
      ? [...existing, { id: newStageId(), skeleton: {} }]
      : [{ id: newStageId(), skeleton: getOwnSkeleton(entity) }, { id: newStageId(), skeleton: {} }];
  run(host, entity.id, existing.length > 0 ? { [STAGES_ATTR]: stages } : { [STAGES_ATTR]: stages, [SKELETON_ATTR]: null });
  return stages[stages.length - 1]!.id;
}

export function setOwnSkeletonField(host: ScriptEditorHost, entity: EntityView, key: string, value: string) {
  run(host, entity.id, { [SKELETON_ATTR]: { ...getOwnSkeleton(entity), [key]: value } });
}

export function setStageField(host: ScriptEditorHost, entity: EntityView, stageId: string, key: string, value: string) {
  const stages = getStages(entity).map(s => (s.id === stageId ? { ...s, skeleton: { ...s.skeleton, [key]: value } } : s));
  run(host, entity.id, { [STAGES_ATTR]: stages });
}

/** Removing the last remaining stage falls the character back to a plain, un-staged leaf again (no
 * separate "un-stage" action needed — the sidebar tree already renders purely off `stages.length`). */
export function deleteStage(host: ScriptEditorHost, entity: EntityView, stageId: string) {
  const stages = getStages(entity).filter(s => s.id !== stageId);
  run(host, entity.id, { [STAGES_ATTR]: stages.length > 0 ? stages : null });
}

/**
 * A generated skeleton merged onto what the writer already has: a field the writer already filled in is kept as
 * they wrote it, a field that is blank takes the generated value. Never overwrites, so generating again (or after
 * hand edits) cannot lose work. Blank/whitespace generated values are ignored.
 */
export function mergeSkeleton(existing: Skeleton, generated: Skeleton): { skeleton: Skeleton; filled: string[] } {
  const skeleton: Skeleton = { ...existing };
  const filled: string[] = [];
  for (const [key, value] of Object.entries(generated)) {
    if (typeof value !== "string" || !value.trim()) continue;
    if (existing[key]?.trim()) continue;
    skeleton[key] = value.trim();
    filled.push(key);
  }
  return { skeleton, filled };
}

/** Replace a whole skeleton in one command (`setOwnSkeletonField` writes one field at a time). */
export function setOwnSkeleton(host: ScriptEditorHost, entity: EntityView, skeleton: Skeleton) {
  run(host, entity.id, { [SKELETON_ATTR]: skeleton });
}

export function setStageSkeleton(host: ScriptEditorHost, entity: EntityView, stageId: string, skeleton: Skeleton) {
  const stages = getStages(entity).map(s => (s.id === stageId ? { ...s, skeleton } : s));
  run(host, entity.id, { [STAGES_ATTR]: stages });
}

/** What the AI actions need of a skeleton: `age` is required by the API, so a character with none yet is sent as "unspecified". */
export function skeletonForAi(skeleton: Skeleton): { age: string } & Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(skeleton)) if (typeof v === "string" && v.trim()) out[k] = v.trim();
  return { ...out, age: out.age ?? "unspecified" };
}

/**
 * Everything known about a character as one labelled string, for the image-generation prompt: the name and
 * every filled-in skeleton field (in worksheet order). A staged character has no own skeleton, so its first
 * life stage stands in. The caller appends the writer's free-text appearance notes and caps the total length,
 * so image generation works from the character sheet alone even when the appearance box is empty.
 */
export function describeCharacterForImage(entity: EntityView): string {
  const own = getOwnSkeleton(entity);
  const skeleton = Object.keys(own).length > 0 ? own : getStages(entity)[0]?.skeleton ?? {};
  const parts: string[] = [];
  const name = entity.name?.trim();
  if (name) parts.push(`Name: ${name}`);
  for (const section of Object.values(SKELETON_SECTIONS)) {
    for (const field of section.fields) {
      const value = skeleton[field.key]?.trim();
      if (value) parts.push(`${field.label}: ${value}`);
    }
  }
  return parts.join("\n");
}
