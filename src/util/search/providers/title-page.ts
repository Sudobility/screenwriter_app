import type { ScriptEditorHost } from "@sudobility/writing_ui";
import { matchRanges } from "../../find-replace";
import { afterMount, highlightInField } from "../highlight";
import type { SearchHit, SearchProvider } from "../types";

/** Band 0: the title page is the front of the document, so it leads global Find Next/Previous order. */
const BAND = 0;

/** The title-page fields in the order `TitlePagePanel` renders them, with their labels. */
const FIELDS: { field: string; label: string }[] = [
  { field: "title", label: "Title" },
  { field: "author", label: "Written by" },
  { field: "basedOn", label: "Based on" },
  { field: "contact", label: "Contact" },
  { field: "draftDate", label: "Draft date" },
  { field: "copyright", label: "Copyright" },
  { field: "notes", label: "Notes" },
];

interface TitleLoc {
  field: string;
  start: number;
  end: number;
}

/** Searches and edits the title page. Reveal opens the Title page panel, then highlights the field. */
export function createTitlePageProvider(host: ScriptEditorHost, nav: { openTitlePanel(): void }): SearchProvider {
  const textOf = (field: string): string => (host.model.titlePage().fields as Record<string, { text?: string } | undefined>)[field]?.text ?? "";

  return {
    id: "titlePage",
    find(query, opts): SearchHit[] {
      const hits: SearchHit[] = [];
      FIELDS.forEach(({ field, label }, i) => {
        const text = textOf(field);
        for (const r of matchRanges(text, query, opts)) {
          const loc: TitleLoc = { field, start: r.start, end: r.end };
          hits.push({ id: `title:${field}:${r.start}`, providerId: "titlePage", order: [BAND, i, r.start], text: text.slice(r.start, r.end), surface: `Title page · ${label}`, loc });
        }
      });
      return hits;
    },
    reveal(hit) {
      const loc = hit.loc as TitleLoc;
      nav.openTitlePanel();
      afterMount(() => {
        const el = document.querySelector<HTMLElement>(`[data-testid="title-panel"] [data-testid="title-${loc.field}"]`);
        if (!el) return false;
        highlightInField(el, loc.start, loc.end); // controlled input already shows the model's text
        return true;
      });
    },
    canReplace: () => true,
    replace(hit, replacement) {
      const loc = hit.loc as TitleLoc;
      const text = textOf(loc.field);
      const next = text.slice(0, loc.start) + replacement + text.slice(loc.end);
      return host.execute([{ id: "title.setField", params: { field: loc.field, text: next } }], { kind: "local-typing", groupKey: "find-replace" }).ok;
    },
    replaceAll(hits, replacement) {
      // Group by field; apply right-to-left within each so offsets stay valid, then one command per field.
      const byField = new Map<string, TitleLoc[]>();
      for (const h of hits) {
        const loc = h.loc as TitleLoc;
        (byField.get(loc.field) ?? byField.set(loc.field, []).get(loc.field)!).push(loc);
      }
      for (const [field, locs] of byField) {
        locs.sort((a, b) => b.start - a.start);
        let text = textOf(field);
        for (const loc of locs) text = text.slice(0, loc.start) + replacement + text.slice(loc.end);
        host.execute([{ id: "title.setField", params: { field, text } }], { kind: "local-command", groupKey: "find-replace-all" });
      }
    },
  };
}
