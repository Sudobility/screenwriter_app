import type { EntityView } from "@sudobility/writing_core";
import type { ScriptEditorHost } from "@sudobility/writing_ui";

/**
 * Notes in the Catalog (per an explicit user requirement): free text the writer keeps with the script, each with a
 * title and a body. `ENTITY_KINDS` is a closed list shared with the API, so a note is a `misc` entity marked with a
 * reserved attribute (the same technique as the built-in Story record, `story-info.ts`): its name is the title, its
 * description the body. Marked entities are shown under "Notes" and left out of the "Misc" group.
 */
const NOTE_ATTR = "note.reserved";

export const isNote = (e: EntityView): boolean => e.kind === "misc" && e.attributes?.[NOTE_ATTR] === true;

export function listNotes(host: ScriptEditorHost): EntityView[] {
  return host.model.entities({ kind: "misc" }).filter(isNote);
}

/** Names are unique per kind, and a note shares its kind with everything "misc": the first free "Note N". */
export function nextNoteTitle(host: ScriptEditorHost): string {
  const taken = new Set(host.model.entities({ kind: "misc" }).flatMap(e => [e.name, ...(e.aliases ?? [])]).map(n => n.trim().toLowerCase()));
  for (let n = 1; ; n++) if (!taken.has(`note ${n}`)) return `Note ${n}`;
}

/** Returns the new note's id, to select it; null when it could not be created (a title that is taken). */
export function addNote(host: ScriptEditorHost, title?: string): string | null {
  const name = title?.trim() || nextNoteTitle(host);
  const r = host.execute([{ id: "entity.create", params: { kind: "misc", name, attributes: { [NOTE_ATTR]: true } } }], { kind: "local-command" });
  if (!r.ok) return null;
  const first = r.results[0];
  const created = first?.ok ? first.effects?.find(e => e.kind === "entityCreated") : undefined;
  return created && "id" in created ? String(created.id) : (listNotes(host).find(e => e.name === name)?.id ?? null);
}
