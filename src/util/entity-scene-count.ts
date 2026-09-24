import type { ScriptEditorHost } from "@sudobility/writing_ui";

/** Distinct scenes among an entity's occurrences — `EntityView` (the live model) carries no precomputed
 * count like the API projection's `EntitySummary.sceneCount` does. Shared by `EditorSidebar` (the
 * Catalog tree row) and `EntityDetailView`. */
export function sceneCountOf(host: ScriptEditorHost, entityId: string): number {
  return new Set(host.model.occurrences(entityId as never).map(o => o.sceneId).filter(Boolean)).size;
}
