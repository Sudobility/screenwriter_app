import { useEffect, useState } from "react";
import type { ScriptEditorHost } from "@sudobility/writing_ui";
import type { NavStore } from "@sudobility/building_blocks";
import type { useAi } from "@sudobility/screenwriter_lib";
import type { AiNote, CoverageReport, Suggestion } from "@sudobility/screenwriter_types";
import { WordDiff as Diff } from "../WordDiff";
import { NoteFixes } from "../NoteFixes";

export const btn = "border border-neutral-300 rounded px-2 py-1 text-xs hover:bg-neutral-100 disabled:opacity-50";
export const primary = "bg-neutral-900 text-white rounded px-3 py-1 text-sm hover:bg-neutral-800 disabled:opacity-50";

export type AiHook = ReturnType<typeof useAi>;

/** The live context every wizard screen/action reads. Rebuilt on each AiWizard render so AI state is fresh. */
export interface AiWizardCtx {
  documentId: string;
  host: ScriptEditorHost;
  ai: AiHook;
  scene: { id: string; heading: string } | null;
  onJumpTo(sceneId: string): void;
  /** The navigation stack store — push a results screen / pop back. */
  store: NavStore;
}

export const VERDICT: Record<CoverageReport["verdict"], string> = {
  recommend: "Recommend",
  consider: "Consider",
  pass: "Pass",
};

const SEVERITY_TONE: Record<AiNote["severity"], string> = {
  praise: "bg-green-100 text-green-800",
  minor: "bg-neutral-100 text-neutral-700",
  moderate: "bg-amber-100 text-amber-800",
  major: "bg-red-100 text-red-800",
};

export function NoteBody({ note }: { note: AiNote }) {
  return (
    <>
      <span className="flex items-center gap-2">
        <span className="font-medium text-sm">{note.title}</span>
        <span className={`text-[10px] uppercase rounded px-1 ${SEVERITY_TONE[note.severity]}`}>{note.severity}</span>
        <span className="text-[10px] uppercase text-neutral-500">{note.category}</span>
      </span>
      <span className="block text-xs text-neutral-700 mt-0.5 whitespace-pre-wrap">{note.body}</span>
    </>
  );
}

export function ReportView({ report, createdAt, host, onJumpTo }: { report: CoverageReport; createdAt: string | null; host: ScriptEditorHost; onJumpTo(sceneId: string): void }) {
  return (
    <div data-testid="ai-report" className="space-y-3">
      <p className="text-xs font-medium" data-testid="ai-report-scope" data-scope={report.scope?.kind ?? "script"}>
        {report.scope?.kind === "scene" ? <>Review of one scene: {report.scope.heading || "(untitled scene)"}</> : <>Review of the complete script</>}
      </p>
      {createdAt && <p className="text-[11px] text-neutral-500">Last review: {new Date(createdAt).toLocaleString()}</p>}
      {report.logline && <p className="text-sm italic">{report.logline}</p>}
      <div className="flex flex-wrap items-center gap-1">
        <span data-testid="ai-verdict" className="text-xs font-semibold border border-neutral-400 rounded px-2 py-0.5">
          {VERDICT[report.verdict]}
        </span>
        {report.genre.map(g => (
          <span key={g} className="text-[11px] bg-neutral-200 rounded px-1.5 py-0.5">
            {g}
          </span>
        ))}
      </div>
      {report.verdictRationale && <p className="text-xs text-neutral-700">{report.verdictRationale}</p>}
      <section>
        <h4 className="text-xs font-semibold uppercase text-neutral-500 mb-1">Summary</h4>
        <p className="text-sm whitespace-pre-wrap" data-testid="ai-report-summary">
          {report.summary}
        </p>
      </section>
      {report.strengths.length > 0 && (
        <section data-testid="ai-strengths">
          <h4 className="text-xs font-semibold uppercase text-neutral-500 mb-1">Strengths</h4>
          <ul className="space-y-2">
            {report.strengths.map(n => (
              <li key={n.id} className="border border-neutral-200 rounded p-2 bg-white">
                <NoteBody note={n} />
              </li>
            ))}
          </ul>
        </section>
      )}
      {report.weaknesses.length > 0 && (
        <section data-testid="ai-weaknesses">
          <h4 className="text-xs font-semibold uppercase text-neutral-500 mb-1">Weaknesses</h4>
          <ul className="space-y-2">
            {report.weaknesses.map(n => (
              <li key={n.id} className="border border-neutral-200 rounded p-2 bg-white" data-testid="ai-weakness">
                <NoteBody note={n} />
                <NoteFixes host={host} note={n} onJumpTo={onJumpTo} />
              </li>
            ))}
          </ul>
        </section>
      )}
      {report.notesByScene.length > 0 && (
        <section data-testid="ai-scene-notes">
          <h4 className="text-xs font-semibold uppercase text-neutral-500 mb-1">Notes by scene</h4>
          <ul className="space-y-3">
            {report.notesByScene.map(g => (
              <li key={g.sceneId} data-scene-id={g.sceneId}>
                <button className="text-xs font-semibold underline text-neutral-700" data-testid="ai-scene-heading" onClick={() => onJumpTo(g.sceneId)}>
                  {g.heading || "Scene"}
                </button>
                <ul className="space-y-1 mt-1">
                  {g.notes.map(n => (
                    <li key={n.id}>
                      <button
                        data-testid="ai-scene-note"
                        data-scene-id={g.sceneId}
                        title="Jump to this scene"
                        onClick={() => onJumpTo(n.anchors[0]?.sceneId ?? g.sceneId)}
                        className="w-full text-left border border-neutral-200 rounded p-2 bg-white hover:bg-neutral-100"
                      >
                        <NoteBody note={n} />
                      </button>
                      <NoteFixes host={host} note={n} sceneId={g.sceneId} onJumpTo={onJumpTo} />
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function SuggestionCard({ s, checked, onToggle, stale }: { s: Suggestion; checked: boolean; onToggle(): void; stale: boolean }) {
  const decided = s.status === "accepted" || s.status === "rejected";
  return (
    <li
      data-testid="ai-suggestion"
      data-suggestion-id={s.id}
      data-element-id={s.elementId}
      data-status={stale ? "stale" : s.status}
      className={`border rounded p-2 bg-white space-y-1 ${stale ? "border-amber-400" : "border-neutral-200"}`}
    >
      {decided || stale ? (
        <p className="text-xs" data-testid="ai-suggestion-state">
          {stale && <span className="text-amber-700 font-medium">Out of date: this line changed</span>}
          {s.status === "accepted" && <span className="text-green-700 font-medium">Accepted: already in your script</span>}
          {s.status === "rejected" && <span className="text-neutral-500 font-medium">Rejected</span>}
        </p>
      ) : (
        <label className="flex items-center gap-2 text-xs">
          <input type="checkbox" aria-label="Select suggestion" checked={checked} onChange={onToggle} />
          <span className="text-neutral-600">{checked ? "Selected" : "Not selected"}</span>
        </label>
      )}
      <div className="text-[10px] uppercase text-neutral-500">Before</div>
      <Diff before={s.before} after={s.after} side="before" />
      <div className="text-[10px] uppercase text-neutral-500">After</div>
      <Diff before={s.before} after={s.after} side="after" />
      {s.rationale && <p className="text-xs text-neutral-600 italic">{s.rationale}</p>}
    </li>
  );
}

/**
 * The accept/reject review of a polish/trim suggestion set. Shared by the Polish and Trim actions —
 * both produce `ai.suggestionSet`. `onRerun` re-runs the producing action (shown in the stale notice).
 */
export function SuggestionReview({ ctx, onRerun, canRerun }: { ctx: AiWizardCtx; onRerun(): void; canRerun: boolean }) {
  const { ai } = ctx;
  const set = ai.suggestionSet;
  const [unticked, setUnticked] = useState<ReadonlySet<string>>(new Set());
  const setId = set?.id;
  useEffect(() => setUnticked(new Set()), [setId]);
  const [staleNotice, setStaleNotice] = useState(false);
  useEffect(() => setStaleNotice(false), [setId]);

  if (!set) return null;

  const staleIds = new Set(ai.staleSuggestionIds);
  const isDecided = (s: Suggestion) => s.status === "accepted" || s.status === "rejected";
  const pending = set.suggestions.filter(s => s.status === "pending" && !staleIds.has(s.id));
  const chosen = pending.filter(s => !unticked.has(s.id)).map(s => s.id);
  const openList = set.suggestions.filter(s => !isDecided(s));
  const decidedList = set.suggestions.filter(isDecided);
  const anyStale = staleIds.size > 0 || set.suggestions.some(s => s.status === "stale");

  const acceptSome = async (ids: string[]) => {
    if (ids.length === 0) return;
    const r = await ai.accept(ids);
    if (!r.ok && r.reason === "stale") setStaleNotice(true);
  };
  const acceptAll = async () => {
    const r = await ai.acceptAll();
    if (!r.ok && r.reason === "stale") setStaleNotice(true);
  };

  return (
    <div data-testid="ai-suggestions" data-set-status={set.status} className="space-y-2">
      {(staleNotice || anyStale) && (
        <div role="alert" data-testid="ai-stale-message" className="bg-amber-50 border border-amber-400 rounded p-2 text-sm text-amber-900">
          The script changed since these suggestions were made. The out-of-date ones are marked and were not applied; you can accept the rest or run it again.
          <div className="mt-1">
            <button className={btn} disabled={ai.busy || !canRerun} onClick={onRerun}>
              Run again
            </button>
          </div>
        </div>
      )}
      {openList.length > 0 ? (
        <ul className="space-y-2" data-testid="ai-open-suggestions">
          {openList.map(s => (
            <SuggestionCard
              key={s.id}
              s={s}
              stale={staleIds.has(s.id) || s.status === "stale"}
              checked={s.status === "pending" && !unticked.has(s.id)}
              onToggle={() =>
                setUnticked(u => {
                  const n = new Set(u);
                  if (!n.delete(s.id)) n.add(s.id);
                  return n;
                })
              }
            />
          ))}
        </ul>
      ) : (
        <p className="text-xs text-neutral-600" data-testid="ai-all-decided">
          Every suggestion has been decided. Run it again for new ones.
        </p>
      )}
      <div className={`flex flex-wrap gap-2 ${pending.length === 0 ? "hidden" : ""}`}>
        <button className={primary} disabled={ai.deciding || chosen.length === 0} onClick={() => void acceptSome(chosen)} data-testid="ai-accept-selected">
          Accept selected ({chosen.length})
        </button>
        <button className={btn} disabled={ai.deciding || pending.length === 0} onClick={() => void acceptAll()} data-testid="ai-accept-all">
          Accept all
        </button>
        <button className={btn} disabled={ai.deciding || pending.length === 0} onClick={() => void ai.reject()} data-testid="ai-reject">
          Reject
        </button>
      </div>
      {decidedList.length > 0 && (
        <details data-testid="ai-decided" className="text-xs">
          <summary className="cursor-pointer text-neutral-600">
            Already decided ({decidedList.length}): {set.counts.accepted} accepted, {set.counts.rejected} rejected
          </summary>
          <ul className="space-y-2 mt-2">
            {decidedList.map(s => (
              <SuggestionCard key={s.id} s={s} stale={false} checked={false} onToggle={() => {}} />
            ))}
          </ul>
        </details>
      )}
      <p className="text-[11px] text-neutral-500" data-testid="ai-set-counts">
        {set.counts.accepted} accepted, {set.counts.rejected} rejected, {set.counts.pending} pending
        {set.counts.stale > 0 ? `, ${set.counts.stale} out of date` : ""}
      </p>
    </div>
  );
}

export function Progress({ ai }: { ai: AiHook }) {
  const p = ai.job?.progress;
  return (
    <div data-testid="ai-progress" className="flex items-center gap-2 text-xs text-neutral-700">
      <span className="inline-block w-3 h-3 rounded-full border-2 border-neutral-400 border-t-transparent animate-spin" />
      <span>{p ? `${p.stage} (${p.done}/${p.total})` : "Working..."}</span>
      <button className={`${btn} ml-auto`} onClick={() => void ai.cancel()} data-testid="ai-cancel">
        Cancel
      </button>
    </div>
  );
}
