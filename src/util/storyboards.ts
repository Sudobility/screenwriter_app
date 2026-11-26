import type { ScriptEditorHost } from "@sudobility/writing_ui";
import type { Screenwriter } from "@sudobility/screenwriter_lib";
import type { ProductionImageRecord, ScriptElement, SceneStoryboard, StoryboardFromSceneResult } from "@sudobility/screenwriter_types";
import { ensureStoryEntity, findStoryEntity } from "./story-info";

/** The scene the storyboard was generated from, needed to give image generation the full scene as context. */
export interface StoryboardScene {
  heading?: string;
  elements: ScriptElement[];
}

const ELEMENT_LABEL: Record<ScriptElement["type"], string> = {
  action: "ACTION",
  character: "CHARACTER",
  parenthetical: "PARENTHETICAL",
  dialogue: "DIALOGUE",
  transition: "TRANSITION",
};

/** The scene as numbered `N| TYPE: text` lines — the same numbering the shot's `lines` refer to (see the API prompt). */
function numberScene(scene: StoryboardScene): string {
  return scene.elements.map((e, i) => `${i + 1}| ${ELEMENT_LABEL[e.type]}: ${e.text.replace(/\s+/g, " ").trim()}`).join("\n");
}

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

/** The whole numbered scene (so a frame stays consistent with the script), with an optional "this frame depicts…" note. */
function frameContext(scene: StoryboardScene, lines?: number[]): string {
  const base = `${scene.heading ? `${scene.heading}\n\n` : ""}${numberScene(scene)}`;
  const refs = lines && lines.length ? `\n\nThis frame depicts line(s): ${lines.join(", ")}.` : "";
  return `${base}${refs}`;
}

/** The storyboard's title/description/instructions, set when the first frame of a scene's storyboard is created. */
export interface StoryboardMeta {
  shortTitle: string;
  detailedDescription: string;
  instructions?: string;
}

/**
 * Draw ONE line-art frame for a shot and APPEND it to the scene's storyboard (creating the storyboard from `meta`
 * the first time, keeping an existing storyboard's title/description on later frames). The frame is drawn with the
 * whole numbered scene as context so it stays consistent with the script; `lines` point the model at the moment.
 * Throws if the image could not be generated (the caller decides how to surface it); nothing is stored on failure.
 */
export async function generateStoryboardFrame(
  sw: Screenwriter,
  host: ScriptEditorHost,
  documentId: string,
  sceneId: string,
  opts: { meta: StoryboardMeta; description: string; lines?: number[]; scene: StoryboardScene; referenceImage?: string },
): Promise<ProductionImageRecord> {
  const flow = sw.createProductionImages(documentId, "storyboard", sceneId);
  const made = await flow.generate({
    description: opts.description,
    context: frameContext(opts.scene, opts.lines),
    ...(opts.referenceImage ? { referenceImage: opts.referenceImage } : {}),
  });
  const record: ProductionImageRecord = { id: made.id, description: opts.description, styleId: made.styleId };
  const existing = getSceneStoryboard(host, sceneId);
  const storyboard: SceneStoryboard = existing
    ? { ...existing, images: [...existing.images, record] }
    : {
        shortTitle: opts.meta.shortTitle,
        detailedDescription: opts.meta.detailedDescription,
        ...(opts.meta.instructions?.trim() ? { instructions: opts.meta.instructions.trim() } : {}),
        images: [record],
      };
  setSceneStoryboard(host, sceneId, storyboard);
  return record;
}

/** Read a storyboard frame's PNG from storage as a `data:image/png;base64,…` URL, for use as a reference image. */
export async function storyboardFrameDataUrl(sw: Screenwriter, documentId: string, sceneId: string, imageId: string): Promise<string | null> {
  const bytes = await sw.createProductionImages(documentId, "storyboard", sceneId).image(imageId).catch(() => null);
  if (!bytes) return null;
  const arr = new Uint8Array(bytes);
  let binary = "";
  for (let i = 0; i < arr.length; i += 8192) binary += String.fromCharCode(...arr.subarray(i, i + 8192));
  return `data:image/png;base64,${btoa(binary)}`;
}

/** Delete one frame's PNG and drop its record; if it was the last frame, remove the scene's storyboard entirely. */
export async function deleteStoryboardImage(sw: Screenwriter, host: ScriptEditorHost, documentId: string, sceneId: string, imageId: string): Promise<void> {
  await sw.createProductionImages(documentId, "storyboard", sceneId).delete(imageId).catch(() => undefined);
  const existing = getSceneStoryboard(host, sceneId);
  if (!existing) return;
  const images = existing.images.filter(img => img.id !== imageId);
  if (images.length === 0) deleteSceneStoryboard(host, sceneId);
  else setSceneStoryboard(host, sceneId, { ...existing, images });
}

/** Delete every frame's PNG and remove the scene's storyboard entirely. */
export async function removeStoryboard(sw: Screenwriter, host: ScriptEditorHost, documentId: string, sceneId: string): Promise<void> {
  const existing = getSceneStoryboard(host, sceneId);
  if (existing) {
    const flow = sw.createProductionImages(documentId, "storyboard", sceneId);
    await Promise.all(existing.images.map(img => flow.delete(img.id).catch(() => undefined)));
  }
  deleteSceneStoryboard(host, sceneId);
}

/**
 * One-click "generate the whole storyboard" (the script toolbar): replace any existing storyboard, store its title and
 * description, then draw every shot's frame (a frame that fails to draw is skipped; the titled storyboard still stands).
 */
export async function applyStoryboard(
  sw: Screenwriter,
  host: ScriptEditorHost,
  documentId: string,
  sceneId: string,
  result: StoryboardFromSceneResult,
  scene: StoryboardScene,
  instructions?: string,
): Promise<SceneStoryboard> {
  await removeStoryboard(sw, host, documentId, sceneId);
  const meta: StoryboardMeta = { shortTitle: result.shortTitle, detailedDescription: result.detailedDescription, instructions };
  // Create the storyboard with its title/description up front, so it stands even if no frame draws.
  setSceneStoryboard(host, sceneId, {
    shortTitle: meta.shortTitle,
    detailedDescription: meta.detailedDescription,
    ...(instructions?.trim() ? { instructions: instructions.trim() } : {}),
    images: [],
  });
  for (const shot of result.shots) {
    try {
      await generateStoryboardFrame(sw, host, documentId, sceneId, { meta, description: shot.description, lines: shot.lines, scene });
    } catch {
      // Keep going: a storyboard with its title + description is still useful even if a frame could not be drawn.
    }
  }
  return getSceneStoryboard(host, sceneId) ?? { ...meta, images: [] };
}
