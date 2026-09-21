import { useEffect, useRef, useState } from "react";
import { resolveStyle } from "@sudobility/writing_core";
import type { ScriptEditorHost } from "@sudobility/writing_ui";
import { useModelTick } from "../util/use-model-tick";

type Slot = "left" | "center" | "right";
type Which = "header" | "footer";
const SLOTS: Slot[] = ["left", "center", "right"];
const PAGE_RE = /\{page\}\.?/g;

const input = "w-full border border-neutral-300 rounded px-2 py-1 text-sm bg-white font-normal";
const select = "border border-neutral-300 rounded px-2 py-1 text-sm bg-white font-normal";

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
export function PageSetupPanel({ host, onClose }: { host: ScriptEditorHost; onClose(): void }) {
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

  const sceneStyle = template.styles.some(s => s.id === template.sceneNumbering.styleId) ? resolveStyle(template, template.sceneNumbering.styleId) : null;
  const numbering = sceneStyle?.numbering;
  const sceneMode = !numbering?.enabled ? "none" : numbering.position === "inline" ? "both" : numbering.position;

  return (
    <aside className="print:hidden w-80 shrink-0 border-l border-neutral-200 bg-neutral-50 overflow-y-auto p-3 space-y-4" aria-label="Page setup" data-testid="setup-panel">
      <div className="flex items-center">
        <h3 className="font-semibold">Page setup</h3>
        <button className="ml-auto border border-neutral-300 rounded px-2 py-1 text-xs hover:bg-neutral-100" onClick={onClose}>
          Close
        </button>
      </div>

      <section className="space-y-2">
        <h4 className="text-xs font-semibold uppercase text-neutral-500">Page numbers</h4>
        <label className="flex items-center gap-2 text-sm">
          Position
          <select data-testid="page-number-position" className={select} value={pagePos()} onChange={e => setPagePos(e.target.value as Slot | "none")}>
            <option value="right">Top right</option>
            <option value="center">Top center</option>
            <option value="left">Top left</option>
            <option value="none">None</option>
          </select>
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
          <select
            data-testid="scene-number-mode"
            className={select}
            value={sceneMode}
            onChange={e => host.execute([{ id: "template.setSceneNumbering", params: { mode: e.target.value } }])}
          >
            <option value="none">Off</option>
            <option value="left">Left margin</option>
            <option value="right">Right margin</option>
            <option value="both">Both margins</option>
          </select>
        </label>
        <p className="text-xs text-neutral-600">Scenes are numbered automatically and renumber as you edit; omitted scenes keep their number.</p>
      </section>
    </aside>
  );
}
