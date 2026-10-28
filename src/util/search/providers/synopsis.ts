import { setSynopsis, type ScriptEditorHost } from "@sudobility/writing_ui";
import { matchRanges } from "../../find-replace";
import { afterMount, highlightInField } from "../highlight";
import type { SearchHit, SearchProvider } from "../types";

/** Band 2: scene synopses come after the title page (0) and script (1), before Catalog entities (3). */
const BAND = 2;

interface SynopsisLoc {
  sceneId: string;
  start: number;
  end: number;
}

type SceneLike = { id: unknown; synopsis: { plain: string }; headingText?: string };

/** Searches and edits scene synopses (the Navigator / Script Structure sidebar). */
export function createSynopsisProvider(host: ScriptEditorHost): SearchProvider {
  const scenes = (): readonly SceneLike[] => host.model.scenes() as unknown as readonly SceneLike[];
  const textOf = (sceneId: string): string => scenes().find(s => String(s.id) === sceneId)?.synopsis.plain ?? "";

  return {
    id: "synopsis",
    find(query, opts): SearchHit[] {
      const hits: SearchHit[] = [];
      scenes().forEach((s, i) => {
        const text = s.synopsis.plain;
        const sceneId = String(s.id);
        const label = `Synopsis${s.headingText ? ` · ${s.headingText}` : ""}`;
        for (const r of matchRanges(text, query, opts)) {
          hits.push({ id: `synopsis:${sceneId}:${r.start}`, providerId: "synopsis", order: [BAND, i, r.start], text: text.slice(r.start, r.end), surface: label, loc: { sceneId, start: r.start, end: r.end } as SynopsisLoc });
        }
      });
      return hits;
    },
    reveal(hit) {
      const loc = hit.loc as SynopsisLoc;
      let openedStructure = false;
      afterMount(() => {
        const rows = Array.from(document.querySelectorAll<HTMLElement>("[data-scene-id]"));
        if (rows.length === 0) {
          // The Navigator (Script Structure) lives under the sidebar's "Scenes" rail item — select it once so the
          // scene rows mount, then keep polling for them.
          if (!openedStructure) {
            openedStructure = true;
            document.querySelector<HTMLElement>('[data-testid="rail-scenes"]')?.click();
          }
          return false;
        }
        const row = rows.find(r => r.dataset.sceneId === loc.sceneId);
        if (!row) return false;
        row.scrollIntoView({ block: "nearest" });
        const syn = row.querySelector<HTMLElement>('[data-testid="nav-synopsis"]');
        if (syn) highlightInField(syn, loc.start, loc.end);
        return true;
      });
    },
    canReplace: () => true,
    replace(hit, replacement) {
      const loc = hit.loc as SynopsisLoc;
      const text = textOf(loc.sceneId);
      return setSynopsis(host, loc.sceneId, text.slice(0, loc.start) + replacement + text.slice(loc.end));
    },
    replaceAll(hits, replacement) {
      const byScene = new Map<string, SynopsisLoc[]>();
      for (const h of hits) {
        const loc = h.loc as SynopsisLoc;
        (byScene.get(loc.sceneId) ?? byScene.set(loc.sceneId, []).get(loc.sceneId)!).push(loc);
      }
      for (const [sceneId, locs] of byScene) {
        locs.sort((a, b) => b.start - a.start);
        let text = textOf(sceneId);
        for (const loc of locs) text = text.slice(0, loc.start) + replacement + text.slice(loc.end);
        setSynopsis(host, sceneId, text);
      }
    },
  };
}
