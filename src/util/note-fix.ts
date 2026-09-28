import type { ElementId } from "@sudobility/writing_core";
import type { ScriptEditorHost } from "@sudobility/writing_ui";
import { AI_ACTION_LIMITS, type AiNote, type NoteFixSuggestion, type ScriptElementType, type SuggestNoteFixRequest } from "@sudobility/screenwriter_types";
import { removeElement, shownText } from "./format-fix";

/**
 * Fixes for a review note: the note and the scene it points at go to the AI, which answers with alternative fixes,
 * each a set of edits of the scene's own elements (new text, or remove). Accepting one applies its edits as ordinary
 * commands. An edit is refused when its element changed since the AI saw it, so a fix never overwrites newer work.
 */

const ROLE_TO_TYPE: Record<string, ScriptElementType> = {
  action: "action",
  character: "character",
  parenthetical: "parenthetical",
  dialogue: "dialogue",
  transition: "transition",
};

export interface NoteFixContext {
  request: SuggestNoteFixRequest;
  sceneId: string;
  /** Element id -> what it held when the request was built: the stored text (to detect a later edit) and the text as shown. */
  seen: Map<string, { stored: string; shown: string; type: ScriptElementType }>;
}

/** The scene a note is about: its first anchor's. Null when the note points at no scene, or the scene is gone or has nothing to edit. */
export function noteFixContext(host: ScriptEditorHost, note: Pick<AiNote, "title" | "body" | "category" | "anchors">, fallbackSceneId?: string): NoteFixContext | null {
  const sceneId = note.anchors[0]?.sceneId ?? fallbackSceneId;
  if (!sceneId) return null;
  const scene = host.model.scene(sceneId as ElementId);
  if (!scene) return null;
  const seen: NoteFixContext["seen"] = new Map();
  const elements: SuggestNoteFixRequest["scene"]["elements"] = [];
  for (const id of scene.elementIds) {
    if (id === scene.id) continue;
    const el = host.model.element(id);
    const type = el?.role ? ROLE_TO_TYPE[el.role] : undefined;
    // Elements the AI has no type for (notes, shots), empty ones and overlong ones are not sent, so they cannot be edited.
    if (!el || !type || !el.text.plain.trim() || el.text.plain.length > AI_ACTION_LIMITS.sceneElementTextMax) continue;
    if (elements.length >= AI_ACTION_LIMITS.sceneElementsMax) break;
    const shown = shownText(host, String(id));
    seen.set(String(id), { stored: el.text.plain, shown, type });
    elements.push({ id: String(id), type, text: shown });
  }
  if (elements.length === 0) return null;
  const focusIds = note.anchors.map(a => a.elementId).filter((id): id is string => !!id && seen.has(id));
  const heading = shownText(host, String(scene.id)).slice(0, AI_ACTION_LIMITS.headingTextMax);
  return {
    sceneId: String(scene.id),
    seen,
    request: {
      note: { title: note.title.slice(0, AI_ACTION_LIMITS.noteTitleMax), body: note.body.slice(0, AI_ACTION_LIMITS.noteBodyMax), category: note.category },
      scene: { ...(heading ? { heading } : {}), elements },
      ...(focusIds.length ? { focusIds } : {}),
    },
  };
}

export interface FixEditView {
  id: string;
  type: ScriptElementType;
  before: string;
  /** Null: the element is removed. */
  after: string | null;
}

/** A suggestion's edits with the text they replace, in script order, for the preview. */
export function fixEdits(ctx: NoteFixContext, suggestion: NoteFixSuggestion): FixEditView[] {
  const order = [...ctx.seen.keys()];
  return suggestion.edits
    .filter(e => ctx.seen.has(e.id))
    .map(e => ({ id: e.id, type: ctx.seen.get(e.id)!.type, before: ctx.seen.get(e.id)!.shown, after: e.text }))
    .sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
}

export interface ApplyFixResult {
  applied: number;
  /** Edits left out because their element was edited or removed since the AI saw it. */
  stale: number;
  firstId: string | null;
}

/**
 * Apply a fix. All or nothing: a fix is a set of edits that belong together (cutting a line and its cue), so when
 * any of its elements changed since, nothing is applied and the writer asks for fixes again.
 */
export function applyFix(host: ScriptEditorHost, ctx: NoteFixContext, suggestion: NoteFixSuggestion): ApplyFixResult {
  const edits = fixEdits(ctx, suggestion);
  const stale = edits.filter(e => host.model.element(e.id as ElementId)?.text.plain !== ctx.seen.get(e.id)!.stored).length;
  if (stale > 0 || edits.length === 0) return { applied: 0, stale, firstId: null };
  let applied = 0;
  let firstId: string | null = null;
  const local = { kind: "local-command" } as const;
  for (const e of edits) {
    if (e.after === null) continue;
    const stored = ctx.seen.get(e.id)!.stored;
    const range = { anchor: { elementId: e.id, offset: 0 }, head: { elementId: e.id, offset: stored.length } };
    if (host.execute([{ id: "text.replaceRange", params: { range, text: e.after } }], local).ok) {
      applied++;
      firstId ??= e.id;
    }
  }
  // Removals last, from the end of the scene backwards, so no removal moves an element still to be handled.
  for (const e of edits.filter(x => x.after === null).reverse()) if (removeElement(host, e.id)) applied++;
  // With only removals, the caret goes to what is left of the scene.
  return { applied, stale: 0, firstId: firstId ?? ctx.sceneId };
}
