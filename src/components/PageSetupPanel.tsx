import { useEffect, useRef, useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@sudobility/components";
import { resolveStyle } from "@sudobility/writing_core";
import type { ScriptEditorHost } from "@sudobility/writing_ui";
import { useModelTick } from "../util/use-model-tick";
import { LockingSection } from "./LockingSection";

type Slot = "left" | "center" | "right";
type Which = "header" | "footer";
const SLOTS: Slot[] = ["left", "center", "right"];
const PAGE_RE = /\{page\}\.?/g;

const input = "w-full border border-neutral-300 rounded px-2 py-1 text-sm bg-white font-normal";

interface Spec {
  enabled: boolean;
  left: string;
  center: string;
  right: string;
  showOnFirstPage: boolean;
}

const TOKENS: [string, string][] = [
  ["{page}", "page number"],
  ["{pages}", "page count"],
  ["{title}", "title"],
  ["{field:author}", "author (any title page field)"],
  ["{draft}", "draft date"],
  ["{date}", "today"],
  ["{scene.heading}", "current scene"],
];

/** Header, footer, page-number position and scene numbering; edits go through template commands. */
export function PageSetupPanel({ host }: { host: ScriptEditorHost }) {
  useModelTick(host);
  const template = host.model.template();
  const [draft, setDraft] = useState<Record<string, string>>({});
  const focused = useRef<string | null>(null);

  const patch = (which: Which, p: Record<string, unknown>, group?: string) =>
    host.execute([{ id: "template.setHeaderFooter", params: { which, patch: p } }], { kind: "local-typing", groupKey: group ?? `hf:${which}` });

  useEffect(() => {
    setDraft(d => {
      const next = { ...d };
      for (const which of ["header", "footer"] as const) for (const s of SLOTS) if (focused.current !== `${which}-${s}`) next[`${which}-${s}`] = template[which][s];
      return Object.keys(next).every(k => next[k] === d[k]) && Object.keys(d).length === Object.keys(next).length ? d : next;
    });
  });

  const spec = (which: Which): Spec => template[which];
  const pagePos = (): Slot | "none" => SLOTS.find(s => template.header[s].includes("{page}")) ?? "none";
  const setPagePos = (pos: Slot | "none") => {
    const h = spec("header");
    const next: Record<Slot, string> = { left: h.left, center: h.center, right: h.right };
    for (const s of SLOTS) next[s] = next[s].replace(PAGE_RE, "").trim();
    if (pos !== "none") next[pos] = `${next[pos] ? `${next[pos]} ` : ""}{page}.`;
    patch("header", { ...next, enabled: SLOTS.some(s => next[s] !== "") }, "hf:pagepos");
  };
  const setSlot = (which: Which, slot: Slot, text: string) => {
    setDraft(d => ({ ...d, [`${which}-${slot}`]: text }));
    const s = spec(which);
    const enabled = SLOTS.some(o => (o === slot ? text : s[o]) !== "");
    patch(which, { [slot]: text, enabled }, `hf:${which}:${slot}`);
  };

  const pg = template.pagination;
  const setContinueds = (patch: Record<string, boolean>) => host.execute([{ id: "template.setContinueds", params: patch }]);

  const sceneStyle = template.styles.some(s => s.id === template.sceneNumbering.styleId) ? resolveStyle(template, template.sceneNumbering.styleId) : null;
  const numbering = sceneStyle?.numbering;
  const sceneMode = !numbering?.enabled ? "none" : numbering.position === "inline" ? "both" : numbering.position;

  return (
    <>
      <section className="space-y-2">
        <h4 className="text-xs font-semibold uppercase text-neutral-500">Page numbers</h4>
        <label className="flex items-center gap-2 text-sm">
          Position
          <Select value={pagePos()} onValueChange={v => setPagePos(v as Slot | "none")}>
            <SelectTrigger data-testid="page-number-position" aria-label="Page number position" className="bg-white text-sm font-normal">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="right">Top right</SelectItem>
              <SelectItem value="center">Top center</SelectItem>
              <SelectItem value="left">Top left</SelectItem>
              <SelectItem value="none">None</SelectItem>
            </SelectContent>
          </Select>
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            data-testid="header-first-page"
            checked={!spec("header").showOnFirstPage}
            onChange={e => patch("header", { showOnFirstPage: !e.target.checked })}
          />
          No header on the first page
        </label>
      </section>

      {(["header", "footer"] as const).map(which => (
        <section key={which} className="space-y-1">
          <h4 className="text-xs font-semibold uppercase text-neutral-500">{which === "header" ? "Header text" : "Footer text"}</h4>
          {SLOTS.map(s => (
            <label key={s} className="flex items-center gap-2 text-xs text-neutral-700">
              <span className="w-12 capitalize">{s}</span>
              <input
                spellCheck={false}
                autoCorrect="off"
                data-testid={`${which}-${s}`}
                className={input}
                value={draft[`${which}-${s}`] ?? template[which][s]}
                onFocus={() => (focused.current = `${which}-${s}`)}
                onBlur={() => (focused.current = null)}
                onChange={e => setSlot(which, s, e.target.value)}
              />
            </label>
          ))}
          {which === "footer" && (
            <label className="flex items-center gap-2 text-sm pt-1">
              <input type="checkbox" data-testid="footer-first-page" checked={spec("footer").showOnFirstPage} onChange={e => patch("footer", { showOnFirstPage: e.target.checked })} />
              Show footer on the first page
            </label>
          )}
        </section>
      ))}

      <details className="text-xs text-neutral-700">
        <summary className="cursor-pointer">Tokens you can use in header and footer text</summary>
        <ul className="mt-1 space-y-0.5" data-testid="token-help">
          {TOKENS.map(([tok, what]) => (
            <li key={tok}>
              <code className="bg-neutral-200 rounded px-1">{tok}</code> {what}
            </li>
          ))}
        </ul>
      </details>

      <section className="space-y-2">
        <h4 className="text-xs font-semibold uppercase text-neutral-500">Scene numbers</h4>
        <label className="flex items-center gap-2 text-sm">
          Show
          <Select value={sceneMode} onValueChange={mode => host.execute([{ id: "template.setSceneNumbering", params: { mode } }])}>
            <SelectTrigger data-testid="scene-number-mode" aria-label="Scene number mode" className="bg-white text-sm font-normal">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Off</SelectItem>
              <SelectItem value="left">Left margin</SelectItem>
              <SelectItem value="right">Right margin</SelectItem>
              <SelectItem value="both">Both margins</SelectItem>
            </SelectContent>
          </Select>
        </label>
        <p className="text-xs text-neutral-600">Scenes are numbered automatically and renumber as you edit until you lock them; omitted scenes keep their number.</p>
      </section>

      <LockingSection host={host} />

      <section className="space-y-2">
        <h4 className="text-xs font-semibold uppercase text-neutral-500">Continueds</h4>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            data-testid="continueds-more"
            checked={pg.dialogue.moreAtBottom && pg.dialogue.contAtTop}
            onChange={e => setContinueds({ moreAtBottom: e.target.checked, contAtTop: e.target.checked })}
          />
          (MORE) and (CONT'D) when dialogue breaks across pages
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" data-testid="continueds-scene-bottom" checked={pg.sceneContinueds.bottom} onChange={e => setContinueds({ sceneBottom: e.target.checked })} />
          (CONTINUED) at the bottom of a page that ends mid-scene
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" data-testid="continueds-scene-top" checked={pg.sceneContinueds.top} onChange={e => setContinueds({ sceneTop: e.target.checked })} />
          CONTINUED: at the top of the next page
        </label>
        <label className="flex items-center gap-2 text-sm pl-6">
          <input
            type="checkbox"
            data-testid="continueds-scene-numbered"
            disabled={!pg.sceneContinueds.top}
            checked={pg.sceneContinueds.numbered}
            onChange={e => setContinueds({ sceneNumbered: e.target.checked })}
          />
          Number them from the second page (CONTINUED: (2))
        </label>
      </section>
    </>
  );
}
