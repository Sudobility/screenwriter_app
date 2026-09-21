import { useState } from "react";
import { formatRevisionDate, revisionReport, revisionShortName } from "@sudobility/writing_core";
import type { DocLayout } from "@sudobility/writing_core";
import type { ScriptEditorHost } from "@sudobility/writing_ui";
import { useModelTick } from "../util/use-model-tick";

const btn = "border border-neutral-300 rounded px-2 py-1 text-sm bg-white hover:bg-neutral-100 disabled:opacity-40 disabled:hover:bg-white";

/** Today's calendar date (local) as yyyy-mm-dd, for the date input. */
const todayInput = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
/** yyyy-mm-dd to UTC midnight of that calendar date (what layout formats as M/D/YY). */
const inputToUtc = (s: string): number | null => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  return m ? Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
};

/** Top-bar chip shown while Revision Mode is on: `REV: Blue`. Click opens the panel. */
export function RevisionIndicator({ host, onClick }: { host: ScriptEditorHost; onClick(): void }) {
  useModelTick(host);
  const rs = host.model.revisionState();
  if (!rs.mode) return null;
  const set = rs.sets.find(s => s.id === rs.activeSetId);
  if (!set) return null;
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid="rev-indicator"
      data-set={set.colorKey}
      title="Revision Mode is on: edits are marked. Click to open Revisions."
      className="rounded px-2 py-1 text-sm font-semibold text-white"
      style={{ background: set.textColor }}
    >
      REV: {revisionShortName(set)}
    </button>
  );
}

/** Revision sets, Revision Mode, mark display and the Revised Pages list (spec 09 F-REV-001..005, F-RPT-010). */
export function RevisionsPanel({
  host,
  layout,
  onClose,
  onGoToPage,
}: {
  host: ScriptEditorHost;
  layout: DocLayout | null;
  onClose(): void;
  /** Zero-based page index; the app switches to the Pages tab and scrolls there. */
  onGoToPage(index: number): void;
}) {
  useModelTick(host);
  const rs = host.model.revisionState();
  const report = revisionReport(host.model, layout ?? { pages: [] });
  const activeIndex = rs.sets.findIndex(s => s.id === rs.activeSetId);
  const firstIndex = rs.sets[0]?.mark === "" ? 1 : 0;
  const nextDefault = rs.sets[activeIndex >= 0 ? activeIndex + 1 : firstIndex] ?? rs.sets[rs.sets.length - 1];
  const [picked, setPicked] = useState<string | null>(null);
  const [date, setDate] = useState(todayInput);
  const [error, setError] = useState<string | null>(null);
  const chosen = rs.sets.find(s => s.id === picked) ?? nextDefault;
  const active = rs.sets.find(s => s.id === rs.activeSetId);

  const run = (cmds: { id: string; params: Record<string, unknown> }[]) => {
    const r = host.execute(cmds, { kind: "local-command" });
    setError(r.ok ? null : `Could not run ${cmds[0]?.id}.`);
    return r.ok;
  };
  const start = () => {
    if (!chosen) return;
    const when = inputToUtc(date);
    if (run([{ id: "revision.setCurrent", params: { setId: chosen.id, ...(when === null ? {} : { date: when }) } }, { id: "revision.mode", params: { on: true } }])) setPicked(null);
  };
  const shown = rs.display !== "none";
  const started = report.filter(r => r.markedElements > 0 || r.date !== null || r.setId === rs.activeSetId);
  const withPages = report.filter(r => r.pages.length > 0);

  return (
    <aside className="print:hidden w-80 shrink-0 border-l border-neutral-200 bg-neutral-50 overflow-y-auto p-3 space-y-4" aria-label="Revisions" data-testid="revisions-panel">
      <div className="flex items-center">
        <h3 className="font-semibold">Revisions</h3>
        <button className="ml-auto border border-neutral-300 rounded px-2 py-1 text-xs hover:bg-neutral-100" onClick={onClose}>
          Close
        </button>
      </div>

      <section className="space-y-2">
        <h4 className="text-xs font-semibold uppercase text-neutral-500">Revision mode</h4>
        <button
          type="button"
          data-testid="rev-mode-toggle"
          aria-pressed={rs.mode}
          disabled={!active}
          title={active ? "Mark every edit with the current revision" : "Start a revision first"}
          onClick={() => run([{ id: "revision.mode", params: { on: !rs.mode } }])}
          className={`border rounded px-3 py-1 text-sm ${rs.mode ? "text-white border-transparent" : "bg-white border-neutral-300 hover:bg-neutral-100"} disabled:opacity-40`}
          style={rs.mode && active ? { background: active.textColor } : undefined}
        >
          {rs.mode ? `On: ${active ? revisionShortName(active) : ""}` : "Off"}
        </button>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            data-testid="rev-display-toggle"
            checked={shown}
            onChange={e => run([{ id: "revision.setDisplay", params: { display: e.target.checked ? "all" : "none", showPageColor: e.target.checked } }])}
          />
          Show revision marks
        </label>
      </section>

      <section className="space-y-2">
        <h4 className="text-xs font-semibold uppercase text-neutral-500">Start new revision</h4>
        <div className="flex items-center gap-2 flex-wrap">
          <select
            data-testid="rev-set-select"
            aria-label="Revision colour"
            className="border border-neutral-300 rounded px-2 py-1 text-sm bg-white"
            value={chosen?.id ?? ""}
            onChange={e => setPicked(e.target.value)}
          >
            {rs.sets.map(s => (
              <option key={s.id} value={s.id}>
                {revisionShortName(s)}
              </option>
            ))}
          </select>
          <input type="date" aria-label="Revision date" data-testid="rev-date" className="border border-neutral-300 rounded px-2 py-1 text-sm bg-white min-w-0 w-40" value={date} onChange={e => setDate(e.target.value)} />
        </div>
        <button className={btn} data-testid="rev-start" disabled={!chosen} onClick={start}>
          Start revision{chosen ? `: ${revisionShortName(chosen)}` : ""}
        </button>
        <p className="text-xs text-neutral-600">Starting a revision turns Revision Mode on. Edits are marked with an asterisk in the margin; pages carry the colour and date.</p>
      </section>

      <section className="space-y-2" data-testid="rev-sets">
        <div className="flex items-center">
          <h4 className="text-xs font-semibold uppercase text-neutral-500">Revision sets</h4>
          <button className={`${btn} ml-auto text-xs`} data-testid="rev-clear-all" disabled={!report.some(r => r.markedElements > 0)} onClick={() => run([{ id: "revision.clear", params: {} }])}>
            Clear all marks
          </button>
        </div>
        {started.length === 0 && <p className="text-sm text-neutral-500">No revisions yet.</p>}
        {started.map(r => (
          <div key={r.setId} className="flex items-center gap-2 text-sm" data-testid={`rev-set-${r.name.replace(/\s+Revision$/i, "").toLowerCase()}`} data-marked={r.markedElements}>
            <span className="inline-block w-3 h-3 rounded-full shrink-0" style={{ background: r.color }} />
            <span className="font-medium">{revisionShortName(r)}</span>
            <span className="text-neutral-500 text-xs">{r.date === null ? "" : formatRevisionDate(r.date)}</span>
            <span className="ml-auto text-xs text-neutral-600" data-testid="rev-set-count">
              {r.markedElements} marked
            </span>
            <button className={`${btn} text-xs`} data-testid="rev-clear-set" disabled={r.markedElements === 0} onClick={() => run([{ id: "revision.clear", params: { setId: r.setId } }])}>
              Clear marks
            </button>
          </div>
        ))}
      </section>

      <section className="space-y-2" data-testid="rev-pages">
        <h4 className="text-xs font-semibold uppercase text-neutral-500">Revised pages</h4>
        {withPages.length === 0 && <p className="text-sm text-neutral-500">No revised pages.</p>}
        {withPages.map(r => (
          <div key={r.setId} className="text-sm" data-testid="rev-pages-set">
            <span className="font-medium" style={{ color: r.color }}>
              {revisionShortName(r)}
            </span>
            :{" "}
            {r.pages.map((p, i) => (
              <span key={p.index}>
                {i > 0 && ", "}
                <button type="button" className="underline text-blue-700" data-testid="rev-page-link" data-page-index={p.index} onClick={() => onGoToPage(p.index)}>
                  {p.label}
                </button>
              </span>
            ))}
          </div>
        ))}
      </section>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </aside>
  );
}
