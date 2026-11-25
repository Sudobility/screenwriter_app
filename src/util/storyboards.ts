import type { ScriptEditorHost } from "@sudobility/writing_ui";
import type { Screenwriter } from "@sudobility/screenwriter_lib";
import type { ProductionImageRecord, SceneStoryboard, StoryboardFromSceneResult } from "@sudobility/screenwriter_types";
import { ensureStoryEntity, findStoryEntity } from "./story-info";

/**
 * Per-scene AI storyboards live on the hidden "Story" entity's `fields.sceneStoryboards`, keyed by scene id. Each is a
 * short title, a detailed description and 1..N line-art frames (the PNG bytes live in object storage; the records here
 * are only metadata). Storyboards are line art, independent of the project image style.
 */
const FIELD = "sceneStoryboards";
const LEGACY_FIELD = "storyboards"; // the old, project-style-bound per-scene image lists — obsolete.

export function getSceneStoryboards(host: ScriptEditorHost): Record<string, SceneStoryboard> {
  const raw = findStoryEntity(host)?.fields?.[FIELD];
  return raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, SceneStoryboard>) : {};
}

export function getSceneStoryboard(host: ScriptEditorHost, sceneId: string): SceneStoryboard | null {
  return getSceneStoryboards(host)[sceneId] ?? null;
}

function writeStoryboards(host: ScriptEditorHost, next: Record<string, SceneStoryboard>): void {
  ensureStoryEntity(host);
  const entity = findStoryEntity(host);
  if (!entity) return;
  host.execute([{ id: "entity.update", params: { entityId: entity.id, patch: { fields: { [FIELD]: next } } } }], { kind: "local-command" });
}

export function setSceneStoryboard(host: ScriptEditorHost, sceneId: string, storyboard: SceneStoryboard): void {
  writeStoryboards(host, { ...getSceneStoryboards(host), [sceneId]: storyboard });
}

export function deleteSceneStoryboard(host: ScriptEditorHost, sceneId: string): void {
  const next = { ...getSceneStoryboards(host) };
  delete next[sceneId];
  writeStoryboards(host, next);
}

/** Drop the obsolete project-style-bound `fields.storyboards` map when a document opens (one-off per doc). */
export function clearLegacyStoryboards(host: ScriptEditorHost): void {
  const entity = findStoryEntity(host);
  if (entity && entity.fields?.[LEGACY_FIELD] !== undefined) {
    host.execute([{ id: "entity.update", params: { entityId: entity.id, patch: { fields: { [LEGACY_FIELD]: null } } } }], { kind: "local-command" });
  }
}

/** The ordered list of scenes that currently have a storyboard, newest-written preserved by map order. */
export function storyboardList(host: ScriptEditorHost): { sceneId: string; storyboard: SceneStoryboard }[] {
  const map = getSceneStoryboards(host);
  // Show them in script order where possible, so the list tracks the Navigator.
  const order = new Map(host.model.scenes().map((s, i) => [String(s.id), i]));
  return Object.entries(map)
    .map(([sceneId, storyboard]) => ({ sceneId, storyboard }))
    .sort((a, b) => (order.get(a.sceneId) ?? 1e9) - (order.get(b.sceneId) ?? 1e9));
}

/**
 * Draw the line-art frames for an AI storyboard result and store it on the scene (replacing any existing one, whose
 * frame files are deleted first). The text call (title/description/shots) is made by the caller through the AI
 * consent/error flow; this does the image generation and the document write. Image generation may be unavailable
 * (e.g. test mode with no image provider); the storyboard is still stored with its title and description, and
 * whatever frames did generate.
 */
export async function applyStoryboard(
  sw: Screenwriter,
  host: ScriptEditorHost,
  documentId: string,
  sceneId: string,
  result: StoryboardFromSceneResult,
  instructions?: string,
): Promise<SceneStoryboard> {
  const trimmed = instructions?.trim() || undefined;
  const flow = sw.createProductionImages(documentId, "storyboard", sceneId);
  // Replacing: remove the previous frames' files before drawing new ones.
  const previous = getSceneStoryboard(host, sceneId);
  if (previous) await Promise.all(previous.images.map(img => flow.delete(img.id).catch(() => undefined)));

  const images: ProductionImageRecord[] = [];
  for (const shot of result.shots) {
    try {
      const made = await flow.generate({ description: shot.description });
      images.push({ id: made.id, description: shot.description, styleId: made.styleId });
    } catch {
      // Keep going: a storyboard with its title + description is still useful even if a frame could not be drawn.
    }
  }

  const storyboard: SceneStoryboard = {
    shortTitle: result.shortTitle,
    detailedDescription: result.detailedDescription,
    ...(trimmed ? { instructions: trimmed } : {}),
    images,
  };
  setSceneStoryboard(host, sceneId, storyboard);
  return storyboard;
}
