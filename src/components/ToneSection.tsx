import { useState } from "react";
import type { ScriptEditorHost } from "@sudobility/writing_ui";
import type { NoteFixSuggestion } from "@sudobility/screenwriter_types";
import { useAiActions } from "../hooks/useAiActions";
import { noteFixContext, fixEdits, applyFix, type NoteFixContext } from "../util/note-fix";
import { AiNotices } from "./AiNotices";

const primary = "bg-neutral-900 text-white rounded px-3 py-1 text-sm hover:bg-neutral-800 disabled:opacity-50";
const TONES = ["darker", "lighter", "funnier", "more tense", "more romantic", "more formal", "more casual", "pulpier"] as const;

/**
 * Tonal pass: rewrite the current scene toward a chosen tone, keeping what happens. The AI returns per-element
 * edits, previewed before/after and applied as ordinary commands through the shared note-fix machinery (so a line
 * edited since the AI saw it is never overwritten).
 */
export function ToneSection({ host, sceneId, onJumpTo }: { host: ScriptEditorHost; sceneId?: string; onJumpTo(sceneId: string): void }) {
  const ai = useAiActions();
  const [tone, setTone] = useState<string>(TONES[0]);
  const [state, setState] = useState<{ ctx: NoteFixContext; result: NoteFixSuggestion } | null>(null);
  const [applied, setApplied] = useState<string | null>(null);

  const run = async () => {
    setState(null);
    setApplied(null);
    const ctx = noteFixContext(host, { title: "Tone", body: "Tone pass", category: "pacing", anchors: [] }, sceneId);
    if (!ctx) {
      setApplied("Put the caret in a scene with lines to retone first.");
      return;
    }
    const res = await ai.run(client => client.tonePass({ scene: ctx.request.scene, tone }));
    if (res) setState({ ctx, result: res.result });
  };

  const apply = () => {
    if (!state) return;
    const r = applyFix(host, state.ctx, state.result);
    setState(null);
    if (r.applied === 0 && r.stale > 0) setApplied("The scene changed since — run the tone pass again.");
    else {
      setApplied(`Applied ${r.applied} edit${r.applied === 1 ? "" : "s"}.`);
      if (r.firstId) onJumpTo(r.firstId);
    }
  };

  const edits = state ? fixEdits(state.ctx, state.result) : [];

  return (
    <section className="space-y-2" data-testid="ai-tone-section">
      <h3 className="text-xs font-semibold uppercase text-neutral-500">Tonal pass</h3>
      <p className="text-xs text-neutral-600">Rewrite the current scene toward a tone, keeping the plot. Review each change before applying.</p>
      <div className="flex gap-1">
        <select className="flex-1 rounded border border-neutral-300 px-2 py-1 text-xs" data-testid="ai-tone-select" value={tone} onChange={e => setTone(e.target.value)} disabled={ai.busy}>
          {TONES.map(t => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        <button className={primary} data-testid="ai-tone-button" disabled={ai.busy || !ai.available} onClick={() => void run()}>
          {ai.busy ? "…" : "Shift tone"}
        </button>
      </div>
      <AiNotices ai={ai} showTestBanner={false} />
      {applied && <p className="text-xs text-neutral-500" data-testid="ai-tone-applied">{applied}</p>}
      {state && (
        <div className="space-y-2 rounded border border-neutral-200 bg-white p-2" data-testid="ai-tone-result">
          <p className="text-xs text-neutral-700">{state.result.summary}</p>
          {edits.length === 0 ? (
            <p className="text-xs text-neutral-500">No changes suggested for this scene.</p>
          ) : (
            <ul className="space-y-1 text-xs">
              {edits.map(e => (
                <li key={e.id} data-testid="ai-tone-edit" className="rounded bg-neutral-50 p-1">
                  <span className="text-neutral-400 line-through">{e.before}</span>
                  <span className="mx-1 text-neutral-400">→</span>
                  <span className="text-neutral-900">{e.after === null ? "(cut)" : e.after}</span>
                </li>
              ))}
            </ul>
          )}
          {edits.length > 0 && (
            <button className={primary} data-testid="ai-tone-apply" disabled={ai.busy} onClick={apply}>
              Apply
            </button>
          )}
        </div>
      )}
    </section>
  );
}
