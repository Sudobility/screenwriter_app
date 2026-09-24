import type { EntityView } from "@sudobility/writing_core";
import type { ScriptEditorHost } from "@sudobility/writing_ui";

/**
 * Built-in, document-level "story bible" items shown under Catalog (Plot — one main plot plus 0..N
 * subplots — Theme, Tagline, Synopsis), per an explicit user requirement. `writing_core` has no
 * document-level concept fitting these (they aren't tied to any `EntityKind` or scene occurrence), and
 * `ENTITY_KINDS` is a closed enum shared with `screenwriter_api`'s own copy of the same schema package —
 * extending it here would risk a real skew (this app aliases `writing_core` straight to source; the API
 * does not), unlike the purely additive, already-generic `attributes` bag used for character skeletons.
 * So: one hidden, auto-provisioned `misc`-kind entity ("Story", `RESERVED_ATTR` marks it so it's
 * filtered out of the normal per-kind Catalog listing, see `EditorSidebar`) holds all four as
 * `attributes`, the same technique as `character-skeleton.ts` — no `writing_core` changes needed here
 * either.
 */

export interface Subplot {
  id: string;
  name: string;
  text: string;
}

const STORY_ENTITY_NAME = "Story";
const RESERVED_ATTR = "story.reserved";
const THEME_ATTR = "story.theme";
const TAGLINE_ATTR = "story.tagline";
const SYNOPSIS_ATTR = "story.synopsis";
const PLOT_MAIN_ATTR = "story.plotMain";
const SUBPLOTS_ATTR = "story.subplots";

export function isStoryEntity(e: EntityView): boolean {
  return e.kind === "misc" && e.attributes?.[RESERVED_ATTR] === true;
}

export function findStoryEntity(host: ScriptEditorHost): EntityView | null {
  return host.model.entities({ kind: "misc" }).find(isStoryEntity) ?? null;
}

/** Idempotent — safe to call on every `EditorSidebar` mount (mirrors the existing `entity.rebuild` "run
 * once per mount, harmless to repeat" comment right above it): a document that already has its "Story"
 * record is a no-op (no Yjs transaction, no undo-stack entry), a fresh document gets one created. */
export function ensureStoryEntity(host: ScriptEditorHost): void {
  if (findStoryEntity(host)) return;
  host.execute([{ id: "entity.create", params: { kind: "misc", name: STORY_ENTITY_NAME, attributes: { [RESERVED_ATTR]: true } } }], { kind: "local-command" });
}

function str(e: EntityView, key: string): string {
  const v = e.attributes?.[key];
  return typeof v === "string" ? v : "";
}

export const getTheme = (e: EntityView): string => str(e, THEME_ATTR);
export const getTagline = (e: EntityView): string => str(e, TAGLINE_ATTR);
export const getSynopsis = (e: EntityView): string => str(e, SYNOPSIS_ATTR);
export const getPlotMain = (e: EntityView): string => str(e, PLOT_MAIN_ATTR);

export function getSubplots(e: EntityView): Subplot[] {
  const raw = e.attributes?.[SUBPLOTS_ATTR];
  return Array.isArray(raw) ? (raw as unknown as Subplot[]) : [];
}

function run(host: ScriptEditorHost, entityId: string, attributes: Record<string, unknown>) {
  host.execute([{ id: "entity.update", params: { entityId, patch: { attributes } } }], { kind: "local-command" });
}

export const setTheme = (host: ScriptEditorHost, e: EntityView, value: string) => run(host, e.id, { [THEME_ATTR]: value });
export const setTagline = (host: ScriptEditorHost, e: EntityView, value: string) => run(host, e.id, { [TAGLINE_ATTR]: value });
export const setSynopsis = (host: ScriptEditorHost, e: EntityView, value: string) => run(host, e.id, { [SYNOPSIS_ATTR]: value });
export const setPlotMain = (host: ScriptEditorHost, e: EntityView, value: string) => run(host, e.id, { [PLOT_MAIN_ATTR]: value });

function newSubplotId(): string {
  return `sub_${Math.random().toString(36).slice(2, 10)}`;
}

/** Returns the new subplot's id, so the caller can select it (same "create it, then select it"
 * convention as `character-skeleton.ts`'s `addAge`/`EditorSidebar`'s "+ Add {kind}"). */
export function addSubplot(host: ScriptEditorHost, e: EntityView): string {
  const id = newSubplotId();
  run(host, e.id, { [SUBPLOTS_ATTR]: [...getSubplots(e), { id, name: "New subplot", text: "" }] });
  return id;
}

export function setSubplotField(host: ScriptEditorHost, e: EntityView, subplotId: string, patch: Partial<Pick<Subplot, "name" | "text">>) {
  const subplots = getSubplots(e).map(s => (s.id === subplotId ? { ...s, ...patch } : s));
  run(host, e.id, { [SUBPLOTS_ATTR]: subplots });
}

export function deleteSubplot(host: ScriptEditorHost, e: EntityView, subplotId: string) {
  const subplots = getSubplots(e).filter(s => s.id !== subplotId);
  run(host, e.id, { [SUBPLOTS_ATTR]: subplots.length > 0 ? subplots : null });
}
