import { useEffect, useMemo, useState } from "react";
import { useEditorSelection, type ScriptEditorHost } from "@sudobility/writing_ui";
import { useAi } from "@sudobility/screenwriter_lib";
import { useAcceptAiConsent, useAiConsent } from "@sudobility/screenwriter_client";
import type { AiNote, CoverageReport, Suggestion } from "@sudobility/screenwriter_types";
import { WordDiff as Diff } from "./WordDiff";
import { GenerateScriptSection } from "./GenerateScriptSection";
import { PolishSceneSection } from "./PolishSceneSection";

const btn = "border border-neutral-300 rounded px-2 py-1 text-xs hover:bg-neutral-100 disabled:opacity-50";
const primary = "bg-neutral-900 text-white rounded px-3 py-1 text-sm hover:bg-neutral-800 disabled:opacity-50";

interface Props {
  documentId: string;
  host: ScriptEditorHost;
  /** Navigator's jump path: Edit view, caret on the scene heading. */
  onJumpTo(sceneId: string): void;
  onClose(): void;
}

const VERDICT: Record<CoverageReport["verdict"], string> = {
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

function NoteBody({ note }: { note: AiNote }) {
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

function ReportView({ report, createdAt, onJumpTo }: { report: CoverageReport; createdAt: string | null; onJumpTo(sceneId: string): void }) {
  return (
    <div data-testid="ai-report" className="space-y-3">
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
              <li key={n.id} className="border border-neutral-200 rounded p-2 bg-white">
                <NoteBody note={n} />
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
      <label className="flex items-center gap-2 text-xs">
        <input type="checkbox" aria-label="Select suggestion" checked={checked} disabled={decided || stale} onChange={onToggle} />
        {stale && <span className="text-amber-700 font-medium">Out of date: this line changed</span>}
        {s.status === "accepted" && <span className="text-green-700 font-medium">Accepted</span>}
        {s.status === "rejected" && <span className="text-neutral-500 font-medium">Rejected</span>}
      </label>
      <div className="text-[10px] uppercase text-neutral-500">Before</div>
      <Diff before={s.before} after={s.after} side="before" />
      <div className="text-[10px] uppercase text-neutral-500">After</div>
      <Diff before={s.before} after={s.after} side="after" />
      {s.rationale && <p className="text-xs text-neutral-600 italic">{s.rationale}</p>}
    </li>
  );
}

export function AiPanel({ documentId, host, onJumpTo, onClose }: Props) {
  const ai = useAi(documentId);
  const consent = useAiConsent();
  const acceptConsent = useAcceptAiConsent();
  const selection = useEditorSelection(host);
  const scene = useMemo(() => {
    const id = selection?.head.elementId;
    const s = id ? host.model.sceneOf(id as never) : null;
    return s ? { id: String(s.id), heading: s.headingText } : null;
  }, [host, selection]);

  // Suggestions are ticked by default; the writer unticks the ones to leave out.
  const [unticked, setUnticked] = useState<ReadonlySet<string>>(new Set());
  const setId = ai.suggestionSet?.id;
  useEffect(() => setUnticked(new Set()), [setId]);
  const [staleNotice, setStaleNotice] = useState(false);
  useEffect(() => setStaleNotice(false), [setId]);

  const set = ai.suggestionSet;
  const stale = new Set(ai.staleSuggestionIds);
  const pending = (set?.suggestions ?? []).filter(s => s.status === "pending" && !stale.has(s.id));
  const chosen = pending.filter(s => !unticked.has(s.id)).map(s => s.id);
  const anyStale = stale.size > 0 || (set?.suggestions ?? []).some(s => s.status === "stale");

  const acceptSome = async (ids: string[]) => {
    if (ids.length === 0) return;
    const r = await ai.accept(ids);
    if (!r.ok && r.reason === "stale") setStaleNotice(true);
  };
  const acceptAll = async () => {
    const r = await ai.acceptAll();
    if (!r.ok && r.reason === "stale") setStaleNotice(true);
  };

  const job = ai.job;
  const running = job?.status === "queued" || job?.status === "running";
  const activeTask = running ? job?.task : null;
  const mode = ai.status?.mode;
  const usable = ai.status?.available === true;

  return (
    <aside className="print:hidden w-96 shrink-0 border-l border-neutral-200 bg-neutral-50 overflow-y-auto p-3 space-y-4" aria-label="AI" data-testid="ai-panel">
      <div className="flex items-center">
        <h2 className="font-semibold">AI</h2>
        <button className={`${btn} ml-auto`} onClick={onClose}>
          Close
        </button>
      </div>

      {mode === "fixture" && (
        <div role="note" data-testid="ai-test-banner" className="bg-amber-100 border border-amber-400 rounded p-2 text-sm font-medium text-amber-900">
          Test mode — these results are canned samples, not real AI output
        </div>
      )}

      {!ai.loaded && <p className="text-xs text-neutral-500">Checking whether AI is available...</p>}
      {ai.loaded && !usable && (
        <div data-testid="ai-unavailable" className="border border-neutral-300 rounded p-3 bg-white text-sm space-y-1">
          <p className="font-medium">AI is not configured on this server.</p>
          <p className="text-xs text-neutral-600">
            Review and polish need an AI provider. Ask whoever runs the server to set it up, then reopen this panel.
          </p>
        </div>
      )}

      {ai.error?.code === "AI_CONSENT_REQUIRED" && (
        <div role="alertdialog" aria-label="AI consent" data-testid="ai-panel-consent" className="border border-neutral-300 rounded p-3 bg-white text-sm space-y-2">
          <p className="font-medium">Use AI on your writing?</p>
          <p className="text-xs text-neutral-600">
            To review or polish, the script text is sent to an AI provider, which returns notes or suggestions. Nothing changes until you accept a suggestion.
          </p>
          <div className="flex gap-2">
            <button
              className={primary}
              data-testid="ai-panel-consent-accept"
              disabled={acceptConsent.isPending || !consent.data}
              onClick={async () => {
                if (!consent.data) return;
                await acceptConsent.mutateAsync({ version: consent.data.currentVersion });
                ai.clearError(); // then press the button again
              }}
            >
              I agree
            </button>
            <button className={btn} onClick={ai.clearError}>
              Not now
            </button>
          </div>
        </div>
      )}
      {ai.error && ai.error.code !== "AI_CONSENT_REQUIRED" && (
        <div role="alert" data-testid="ai-error" data-code={ai.error.code} className="bg-red-50 border border-red-300 rounded p-2 text-sm text-red-800 flex gap-2">
          <span>{ai.error.message}</span>
          <button className="ml-auto underline text-xs" onClick={ai.clearError}>
            Dismiss
          </button>
        </div>
      )}

      {usable && (
        <>
          <section className="space-y-2" data-testid="ai-review-section">
            <h3 className="text-xs font-semibold uppercase text-neutral-500">Review</h3>
            <p className="text-xs text-neutral-600">Coverage notes on the whole script: summary, strengths, weaknesses and notes by scene.</p>
            <button className={primary} disabled={ai.busy} onClick={() => void ai.startReview()} data-testid="ai-review-button">
              Review this script
            </button>
            {activeTask === "coverage" && <Progress ai={ai} />}
            {job?.task === "coverage" && job.status === "cancelled" && <p className="text-xs text-neutral-500">Review cancelled.</p>}
            {ai.report && <ReportView report={ai.report} createdAt={ai.reportCreatedAt} onJumpTo={onJumpTo} />}
          </section>

          <section className="space-y-2" data-testid="ai-polish-section">
            <h3 className="text-xs font-semibold uppercase text-neutral-500">Polish</h3>
            <p className="text-xs text-neutral-600">Tighter dialogue, as suggestions you accept or reject one by one. Nothing changes until you accept.</p>
            <p className="text-sm" data-testid="ai-polish-scope">
              Scope: <strong>Current scene</strong>
              {scene ? <>: {scene.heading || "(untitled scene)"}</> : <span className="text-neutral-500"> (click in the script to choose a scene)</span>}
            </p>
            <button
              className={primary}
              disabled={ai.busy || !scene}
              onClick={() => scene && void ai.startPolish({ sceneIds: [scene.id] })}
              data-testid="ai-polish-button"
            >
              Polish dialogue
            </button>
            {activeTask === "polish.dialogue" && <Progress ai={ai} />}
            {job?.task === "polish.dialogue" && job.status === "cancelled" && <p className="text-xs text-neutral-500">Polish cancelled.</p>}
            {ai.polishFoundNothing && <p className="text-xs text-neutral-600">The AI found nothing worth changing in that scene.</p>}

            {set && (
              <div data-testid="ai-suggestions" data-set-status={set.status} className="space-y-2">
                {(staleNotice || anyStale) && (
                  <div role="alert" data-testid="ai-stale-message" className="bg-amber-50 border border-amber-400 rounded p-2 text-sm text-amber-900">
                    The script changed since these suggestions were made. The out-of-date ones are marked and were not applied; you can accept the rest or
                    run polish again.
                    <div className="mt-1">
                      <button className={btn} disabled={ai.busy || !scene} onClick={() => scene && void ai.startPolish({ sceneIds: [scene.id] })}>
                        Run polish again
                      </button>
                    </div>
                  </div>
                )}
                <ul className="space-y-2">
                  {set.suggestions.map(s => (
                    <SuggestionCard
                      key={s.id}
                      s={s}
                      stale={stale.has(s.id) || s.status === "stale"}
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
                <div className="flex flex-wrap gap-2">
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
                <p className="text-[11px] text-neutral-500" data-testid="ai-set-counts">
                  {set.counts.accepted} accepted, {set.counts.rejected} rejected, {set.counts.pending} pending
                  {set.counts.stale > 0 ? `, ${set.counts.stale} out of date` : ""}
                </p>
              </div>
            )}
          </section>

          {/* Structured AI actions (synchronous): generate a script from a story; polish the scene using the characters' skeletons.
              Character-level actions (skeleton from a description, dialogue polish) live on the character in the Catalog. */}
          <div className="border-t border-neutral-200 pt-4 space-y-6">
            <GenerateScriptSection host={host} onInserted={onJumpTo} />
            <PolishSceneSection host={host} scene={scene} />
          </div>
        </>
      )}
    </aside>
  );
}

function Progress({ ai }: { ai: ReturnType<typeof useAi> }) {
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
