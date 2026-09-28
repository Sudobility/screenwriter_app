import type { ElementId } from "@sudobility/writing_core";
import type { ScriptEditorHost } from "@sudobility/writing_ui";
import type { EntityView } from "@sudobility/writing_core";
import type { GeneratedScene, GenerateScriptResult, ScriptElement, ScriptElementType } from "@sudobility/screenwriter_types";

/**
 * Reading the script into what the AI actions take, and writing their results back as ordinary editor commands
 * (so every change is undoable, syncs, and goes through the same paths a keystroke does). Nothing here talks to
 * the API; `components/*Section.tsx` do.
 */

// ---- Element roles <-> the API's element types ----

const ROLE_TO_TYPE: Record<string, ScriptElementType> = {
  action: "action",
  character: "character",
  parenthetical: "parenthetical",
  dialogue: "dialogue",
  transition: "transition",
};
const roleOfType: Record<ScriptElementType, string> = { action: "action", character: "character", parenthetical: "parenthetical", dialogue: "dialogue", transition: "transition" };

const SETTING_PREFIX = { int: "INT.", ext: "EXT.", intExt: "INT./EXT." } as const;

/** "INT. LIGHTHOUSE - NIGHT" from a structured heading. */
export function headingText(h: GeneratedScene["heading"]): string {
  return `${SETTING_PREFIX[h.setting]} ${h.location.trim().toUpperCase()} - ${h.time.trim().toUpperCase()}`;
}

/** The style id a role is written in, in this document's template (which may lack some roles). */
function styleForRole(host: ScriptEditorHost, role: string): string | null {
  return host.model.stylesByRole(role as never)[0]?.id ?? null;
}

// ---- Reading ----

export interface SceneRead {
  sceneId: string;
  heading: string;
  /** The body, mapped to the API's element types. */
  elements: ScriptElement[];
  /** Ids of the body elements the `elements` came from (same order), heading excluded. */
  elementIds: string[];
  /** Body elements with a role the API has no type for (notes, shots, ...): replacing the scene would lose them. */
  unsupported: number;
}

export function readScene(host: ScriptEditorHost, sceneId: string): SceneRead | null {
  const scene = host.model.scene(sceneId as ElementId);
  if (!scene) return null;
  const elements: ScriptElement[] = [];
  const elementIds: string[] = [];
  let unsupported = 0;
  for (const id of scene.elementIds) {
    if (id === scene.id) continue; // the heading
    const el = host.model.element(id);
    if (!el) continue;
    const text = el.text.plain;
    const type = el.role ? ROLE_TO_TYPE[el.role] : undefined;
    if (!text.trim()) {
      // An empty element carries nothing for the AI; it is not "unsupported" either, but replacing drops it too.
      elementIds.push(id);
      continue;
    }
    if (!type) {
      unsupported++;
      continue;
    }
    elements.push({ type, text });
    elementIds.push(id);
  }
  return { sceneId: String(scene.id), heading: scene.headingText, elements, elementIds, unsupported };
}

/** The character entities that speak in a scene (a cue whose name resolves to the entity). */
export function speakersIn(host: ScriptEditorHost, sceneId: string): EntityView[] {
  return host.model
    .entities({ kind: "character" })
    .filter(e => host.model.occurrences(e.id).some(o => o.source === "speaker" && o.sceneId === sceneId));
}

export interface DialogueLine {
  id: string;
  text: string;
  sceneId: string | null;
  sceneHeading: string;
}

/** Every dialogue line the character speaks (parentheticals are not lines), optionally in one scene, in script order. */
export function dialogueOf(host: ScriptEditorHost, entity: EntityView, sceneId?: string): DialogueLine[] {
  const cues = new Set(host.model.occurrences(entity.id).filter(o => o.source === "speaker").map(o => String(o.elementId)));
  const lines: DialogueLine[] = [];
  const all = host.model.elements();
  for (let i = 0; i < all.length; i++) {
    if (!cues.has(String(all[i]!.id))) continue;
    const scene = host.model.sceneOf(all[i]!.id);
    if (sceneId && String(scene?.id) !== sceneId) continue;
    for (let j = i + 1; j < all.length; j++) {
      const el = all[j]!;
      if (el.role !== "dialogue" && el.role !== "parenthetical") break;
      if (el.role === "dialogue" && el.text.plain.trim()) {
        lines.push({ id: String(el.id), text: el.text.plain, sceneId: scene ? String(scene.id) : null, sceneHeading: scene?.headingText ?? "" });
      }
    }
  }
  return lines;
}

/** The scenes in which the character speaks, for a scope picker. */
export function scenesSpokenIn(host: ScriptEditorHost, entity: EntityView): { id: string; heading: string }[] {
  const seen = new Map<string, string>();
  for (const o of host.model.occurrences(entity.id)) {
    if (o.source !== "speaker" || !o.sceneId || seen.has(String(o.sceneId))) continue;
    seen.set(String(o.sceneId), host.model.scene(o.sceneId)?.headingText ?? "");
  }
  return [...seen].map(([id, heading]) => ({ id, heading }));
}

// ---- Writing ----

export interface LineEdit {
  id: string;
  /** What the line said when the AI saw it: an edit is refused if the line has changed since. */
  before: string;
  after: string;
}

/** Replace individual lines' text. A line edited since (or gone) is `stale` and left alone. */
export function applyLineEdits(host: ScriptEditorHost, edits: LineEdit[]): { applied: string[]; stale: string[] } {
  const applied: string[] = [];
  const stale: string[] = [];
  for (const e of edits) {
    const el = host.model.element(e.id as ElementId);
    if (!el || el.text.plain !== e.before) {
      stale.push(e.id);
      continue;
    }
    const range = { anchor: { elementId: e.id, offset: 0 }, head: { elementId: e.id, offset: e.before.length } };
    const r = host.execute([{ id: "text.replaceRange", params: { range, text: e.after } }], { kind: "local-command" });
    (r.ok ? applied : stale).push(e.id);
  }
  return { applied, stale };
}

/** Insert one element after `after` (or at the end); returns the new id. */
function insertAfter(host: ScriptEditorHost, after: string | null, role: string, text: string): string | null {
  const style = styleForRole(host, role) ?? styleForRole(host, "action");
  if (!style) return null;
  const params: Record<string, unknown> = { style, text };
  if (after) params.after = after;
  const r = host.execute([{ id: "element.insert", params }], { kind: "local-command" });
  return r.ok ? (r.effects.inserted[0] ?? null) : null;
}

/**
 * Replace a scene's body (everything after its heading) with new elements: the new ones are inserted after the old
 * body, then the old body is deleted as one range, so the heading, its scene number and everything around the scene
 * stay as they were. Returns false, changing nothing, when the scene is gone or has content the API cannot carry.
 */
export function replaceSceneBody(host: ScriptEditorHost, sceneId: string, elements: ScriptElement[], expected?: ScriptElement[]): boolean {
  const scene = readScene(host, sceneId);
  if (!scene || scene.unsupported > 0) return false;
  // The scene changed since the AI saw it: refuse rather than silently discard the writer's newer edits.
  if (expected && JSON.stringify(expected) !== JSON.stringify(scene.elements)) return false;
  const heading = host.model.element(sceneId as ElementId);
  if (!heading) return false;
  const oldIds = scene.elementIds;
  let prev = oldIds.length > 0 ? oldIds[oldIds.length - 1]! : sceneId;
  for (const e of elements) {
    const id = insertAfter(host, prev, roleOfType[e.type], e.text);
    if (!id) return false;
    prev = id;
  }
  if (oldIds.length > 0) {
    const last = host.model.element(oldIds[oldIds.length - 1] as ElementId);
    const range = {
      anchor: { elementId: sceneId, offset: heading.text.plain.length },
      head: { elementId: oldIds[oldIds.length - 1]!, offset: last?.text.plain.length ?? 0 },
    };
    host.execute([{ id: "text.deleteRange", params: { range } }], { kind: "local-command" });
  }
  return true;
}

const isBlank = (host: ScriptEditorHost): boolean => {
  const els = host.model.elements();
  return els.length > 0 && els.every(e => !e.text.plain.trim());
};

export interface ScriptRow {
  /** An element role of the template: `sceneHeading`, `action`, `character`, ... */
  role: string;
  text: string;
}

/** A generated script as rows: every scene's heading, then its elements. */
export function scriptRows(script: GenerateScriptResult): ScriptRow[] {
  return script.scenes.flatMap(s => [{ role: "sceneHeading", text: headingText(s.heading) }, ...s.elements.map(e => ({ role: roleOfType[e.type], text: e.text }))]);
}

/** Scenes whose heading is already text (Smart Paste keeps the writer's own); a null heading is text before the first one. */
export function pastedRows(scenes: { heading: string | null; elements: ScriptElement[] }[]): ScriptRow[] {
  return scenes.flatMap(s => [...(s.heading ? [{ role: "sceneHeading", text: s.heading }] : []), ...s.elements.map(e => ({ role: roleOfType[e.type], text: e.text }))]);
}

/** The last element of a scene: what comes after it belongs to the next scene. Null when the scene is gone. */
export function lastElementOfScene(host: ScriptEditorHost, sceneId: string): string | null {
  const scene = host.model.scene(sceneId as ElementId);
  if (!scene) return null;
  const ids = scene.elementIds;
  return String(ids.length > 0 ? ids[ids.length - 1] : scene.id);
}

export interface InsertResult {
  firstId: string | null;
  written: number;
  skipped: number;
}

/**
 * Write rows into the document as ordinary `element.insert` commands. A new document holds one empty element, which
 * is reused for the first row; otherwise the rows go after the scene `afterSceneId` (so no scene is split), or after
 * the last element when no scene is given or it no longer exists. `afterElementId` puts them after that one element
 * instead (a technique inserted at the caret). Returns the first new element's id, how many
 * elements were written, and how many were skipped (a template with no style for the role).
 */
export function insertRows(host: ScriptEditorHost, rows: ScriptRow[], afterSceneId?: string | null, afterElementId?: string | null): InsertResult {
  let prev: string | null = null;
  let firstId: string | null = null;
  let written = 0;
  let skipped = 0;
  let starter: string | null = null;
  if (isBlank(host)) starter = String(host.model.elements()[0]!.id);
  else if (afterElementId && host.model.element(afterElementId as ElementId)) prev = afterElementId;
  else if (afterSceneId) prev = lastElementOfScene(host, afterSceneId);
  for (const [i, row] of rows.entries()) {
    let id: string | null = null;
    if (i === 0 && starter) {
      const style = styleForRole(host, row.role);
      if (style) {
        host.execute([{ id: "element.setStyle", params: { elements: [starter], style } }], { kind: "local-command" });
        const range = { anchor: { elementId: starter, offset: 0 }, head: { elementId: starter, offset: 0 } };
        id = host.execute([{ id: "text.replaceRange", params: { range, text: row.text } }], { kind: "local-command" }).ok ? starter : null;
      }
    } else {
      id = insertAfter(host, prev, row.role, row.text);
    }
    if (!id) {
      skipped++;
      continue;
    }
    written++;
    prev = id;
    firstId ??= id;
  }
  return { firstId, written, skipped };
}

/**
 * Write a generated script into the document: into the empty starter element of a new document, otherwise after
 * the last element.
 */
export function insertScript(host: ScriptEditorHost, script: GenerateScriptResult): InsertResult {
  return insertRows(host, scriptRows(script));
}
