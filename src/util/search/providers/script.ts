import type { CommandInvocation } from "@sudobility/writing_core";
import { getSelectionStore, plainToYIndex, type ScriptEditorHost } from "@sudobility/writing_ui";
import { matchRanges } from "../../find-replace";
import { afterMount } from "../highlight";
import type { SearchHit, SearchProvider } from "../types";

/** Band 1: the script body sits between the title page (0) and the Catalog entities (2) in global order. */
const BAND = 1;

interface ScriptLoc {
  elementId: string;
  order: number;
  start: number;
  end: number;
}

/** A `text.replaceRange` over one match, converting plain offsets to Y.Text indices (embeds count there). */
function replaceCommand(host: ScriptEditorHost, loc: ScriptLoc, text: string): CommandInvocation {
  const v = host.model.element(loc.elementId as never);
  const embeds = v ? v.text.embeds.map(e => e.at) : [];
  return {
    id: "text.replaceRange",
    params: {
      range: {
        anchor: { elementId: loc.elementId, offset: plainToYIndex(embeds, loc.start) },
        head: { elementId: loc.elementId, offset: plainToYIndex(embeds, loc.end) },
      },
      text,
    },
  };
}

/** Searches and edits the screenplay body (every element's text). Reveal reuses the editor's selection store. */
export function createScriptProvider(host: ScriptEditorHost, nav: { showScript(): void }): SearchProvider {
  return {
    id: "script",
    find(query, opts): SearchHit[] {
      const hits: SearchHit[] = [];
      const els = host.model.elements();
      for (let order = 0; order < els.length; order++) {
        const v = els[order];
        const plain = v.text.plain;
        for (const r of matchRanges(plain, query, opts)) {
          const loc: ScriptLoc = { elementId: String(v.id), order, start: r.start, end: r.end };
          hits.push({
            id: `script:${loc.elementId}:${r.start}`,
            providerId: "script",
            order: [BAND, order, r.start],
            text: plain.slice(r.start, r.end),
            surface: "Script",
            loc,
          });
        }
      }
      return hits;
    },
    reveal(hit) {
      const loc = hit.loc as ScriptLoc;
      nav.showScript();
      afterMount(() => {
        const store = getSelectionStore(host);
        if (!store.reveal) return false; // editor not mounted yet
        store.reveal({ elementId: loc.elementId, offset: loc.start }, { elementId: loc.elementId, offset: loc.end });
        store.focusEditor?.();
        return true;
      });
    },
    canReplace: () => true,
    replace(hit, replacement) {
      return host.execute([replaceCommand(host, hit.loc as ScriptLoc, replacement)], { kind: "local-command", groupKey: "find-replace" }).ok;
    },
    replaceAll(hits, replacement) {
      // Right-to-left (descending start within each element) so each replacement leaves earlier offsets valid.
      const ordered = [...hits].sort((a, b) => {
        const la = a.loc as ScriptLoc;
        const lb = b.loc as ScriptLoc;
        return lb.order - la.order || lb.start - la.start;
      });
      const cmds = ordered.map(h => replaceCommand(host, h.loc as ScriptLoc, replacement));
      if (cmds.length) host.execute(cmds, { kind: "local-command", groupKey: "find-replace-all" });
    },
    cursor() {
      const sel = getSelectionStore(host).get();
      if (!sel) return null;
      const order = host.model.indexOf(sel.head.elementId as never);
      if (order < 0) return null;
      return [BAND, order, sel.head.offset];
    },
  };
}
