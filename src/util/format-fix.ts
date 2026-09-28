import type { ElementId } from "@sudobility/writing_core";
import type { ScriptEditorHost } from "@sudobility/writing_ui";

/**
 * Mechanical formatting the writer cannot see and should not have to hunt for, found and fixed without any AI:
 *
 * - **Case.** Scene headings, character cues and transitions are SHOWN in capitals by their style whatever case was
 *   typed, so a heading typed "int. church - day" looks right in the editor but is stored, exported and read (by
 *   the AI review, by other software) in lower case. The fix stores what is shown.
 * - **Empty elements.** A line with no text: an Enter too many, or a placeholder never filled in.
 * - **Stray spaces** at the start or end of an element.
 *
 * Everything is an ordinary command, so it is undoable and syncs. Scene headings are never removed, even when
 * empty: removing one merges two scenes, which is a decision, not formatting.
 */
export interface FormatIssues {
  /** Elements whose style shows capitals but whose stored text is not in capitals. */
  caseIds: string[];
  /** Elements with no text (scene headings excluded). */
  emptyIds: string[];
  /** Elements with spaces at the start or the end. */
  spaceIds: string[];
  total: number;
}

const local = { kind: "local-command" } as const;
const upper = (host: ScriptEditorHost, text: string): string => text.toLocaleUpperCase(documentLanguage(host));

function documentLanguage(host: ScriptEditorHost): string | undefined {
  const lang = (host.model as unknown as { language?: unknown }).language;
  return typeof lang === "string" && lang ? lang : undefined;
}

/** The text of an element as the editor and the page show it. */
export function shownText(host: ScriptEditorHost, id: string): string {
  const el = host.model.element(id as ElementId);
  if (!el) return "";
  return host.model.resolveStyle(id as ElementId).allCaps ? upper(host, el.text.plain) : el.text.plain;
}

export function findFormatIssues(host: ScriptEditorHost): FormatIssues {
  const out: FormatIssues = { caseIds: [], emptyIds: [], spaceIds: [], total: 0 };
  const all = host.model.elements();
  for (const el of all) {
    const id = String(el.id);
    const text = el.text.plain;
    if (!text.trim()) {
      // The only element of a document stays: a document is never without one.
      if (el.role !== "sceneHeading" && all.length > 1) out.emptyIds.push(id);
      continue;
    }
    if (text !== text.trim()) out.spaceIds.push(id);
    if (host.model.resolveStyle(el.id).allCaps && text !== upper(host, text)) out.caseIds.push(id);
  }
  // Every element of a document cannot be removed: keep the first of them when all are empty.
  if (out.emptyIds.length === all.length) out.emptyIds.shift();
  out.total = out.caseIds.length + out.emptyIds.length + out.spaceIds.length;
  return out;
}

/**
 * Remove one element. There is no delete command: the element's text is deleted together with the break before it,
 * which joins it to the previous element (that keeps its own style). The first element of the document has no
 * previous one, so the break after it goes instead and the element takes the style of the one that followed.
 */
export function removeElement(host: ScriptEditorHost, id: string): boolean {
  const all = host.model.elements();
  const at = all.findIndex(e => String(e.id) === id);
  if (at < 0 || all.length < 2) return false;
  const el = all[at]!;
  if (at > 0) {
    const prev = all[at - 1]!;
    const range = { anchor: { elementId: String(prev.id), offset: prev.text.plain.length }, head: { elementId: id, offset: el.text.plain.length } };
    return host.execute([{ id: "text.deleteRange", params: { range } }], local).ok;
  }
  const next = all[1]!;
  const range = { anchor: { elementId: id, offset: 0 }, head: { elementId: String(next.id), offset: 0 } };
  if (!host.execute([{ id: "text.deleteRange", params: { range } }], local).ok) return false;
  host.execute([{ id: "element.setStyle", params: { elements: [id], style: next.style } }], local);
  return true;
}

export interface FormatFixResult {
  cased: number;
  removed: number;
  tidied: number;
}

export function fixFormatting(host: ScriptEditorHost): FormatFixResult {
  const issues = findFormatIssues(host);
  const out: FormatFixResult = { cased: 0, removed: 0, tidied: 0 };

  for (const id of issues.spaceIds) {
    const text = host.model.element(id as ElementId)?.text.plain ?? "";
    const lead = text.length - text.trimStart().length;
    const tail = text.trimEnd().length;
    // The end first, so the offsets of the start are still right.
    let ok = true;
    if (tail < text.length) ok = host.execute([{ id: "text.deleteRange", params: { range: { anchor: { elementId: id, offset: tail }, head: { elementId: id, offset: text.length } } } }], local).ok && ok;
    if (lead > 0) ok = host.execute([{ id: "text.deleteRange", params: { range: { anchor: { elementId: id, offset: 0 }, head: { elementId: id, offset: lead } } } }], local).ok && ok;
    if (ok) out.tidied++;
  }

  for (const id of issues.caseIds) {
    const length = host.model.element(id as ElementId)?.text.plain.length ?? 0;
    const range = { anchor: { elementId: id, offset: 0 }, head: { elementId: id, offset: length } };
    // `text.transformCase` keeps bold, italics and the like on the runs it rewrites.
    if (host.execute([{ id: "text.transformCase", params: { range, to: "upper" } }], local).ok) out.cased++;
  }

  // Last first: removing an element never moves one that is still to be removed.
  for (const id of [...issues.emptyIds].reverse()) if (removeElement(host, id)) out.removed++;
  return out;
}

const plural = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`;

/** "3 headings or cues put in capitals, 2 empty lines removed." */
export function describeFix(r: FormatFixResult): string {
  const parts = [
    r.cased ? `${plural(r.cased, "heading or cue", "headings or cues")} put in capitals` : "",
    r.removed ? `${plural(r.removed, "empty line")} removed` : "",
    r.tidied ? `${plural(r.tidied, "line")} trimmed` : "",
  ].filter(Boolean);
  return parts.length ? `${parts.join(", ")}.` : "Nothing to fix.";
}
