import { useState } from "react";
import type { AiNote, NoteFixSuggestion } from "@sudobility/screenwriter_types";
import type { ScriptEditorHost } from "@sudobility/writing_ui";
import { useAiActions } from "../hooks/useAiActions";
import { applyFix, fixEdits, noteFixContext, type NoteFixContext } from "../util/note-fix";
import { AiNotices } from "./AiNotices";
import { FixFormattingButton } from "./FixFormattingButton";
import { WordDiff } from "./WordDiff";

const btn = "border border-neutral-300 rounded px-2 py-1 text-xs hover:bg-neutral-100 disabled:opacity-50";
const primary = "bg-neutral-900 text-white rounded px-2 py-1 text-xs hover:bg-neutral-800 disabled:opacity-50";

const TYPE_LABEL = { action: "Action", character: "Character", parenthetical: "Parenthetical", dialogue: "Dialogue", transition: "Transition" } as const;

/**
 * Under a review note: "Suggest fixes" asks the AI for up to three different ways to fix what the note describes,
 * each shown as before/after of the lines it changes, each with its own Accept. Accepting applies that one fix to
 * the script (undoable) and takes the editor there. Nothing changes until Accept. A `format` note also offers the
 * (non-AI) one-click formatting fix, since that is usually what such a note is about.
 */
export function NoteFixes({ host, note, sceneId, onJumpTo }: { host: ScriptEditorHost; note: AiNote; sceneId?: string; onJumpTo(id: string): void }) {
  const ai = useAiActions();
  const [ctx, setCtx] = useState<NoteFixContext | null>(null);
  const [fixes, setFixes] = useState<NoteFixSuggestion[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [accepted, setAccepted] = useState(false);

  if (note.severity === "praise") return null;
  const hasScene = !!(note.anchors[0]?.sceneId ?? sceneId);

  const suggest = async () => {
    setMessage(null);
    setFixes(null);
    setAccepted(false);
    const next = noteFixContext(host, note, sceneId);
    if (!next) {
      setMessage("That scene is no longer in the script, or has no lines to change.");
      return;
    }
    setCtx(next);
    const res = await ai.run(client => client.suggestNoteFix(next.request));
    if (!res) return;
    setFixes(res.result.suggestions);
    if (res.result.suggestions.length === 0) setMessage("The AI found no way to fix this by changing lines of this scene. It may need a change in the story or in another scene.");
  };

  const accept = (fix: NoteFixSuggestion) => {
    if (!ctx) return;
    const r = applyFix(host, ctx, fix);
    if (r.applied === 0) {
      setMessage("The scene changed since these fixes were suggested, so nothing was applied. Ask for fixes again.");
      setFixes(null);
      return;
    }
    // The other fixes were written for the text as it was: they no longer apply.
    setFixes(null);
    setAccepted(true);
    setMessage(`Applied: ${fix.summary} You can undo this from the editor.`);
    if (r.firstId) onJumpTo(r.firstId);
  };

  return (
    <div className="mt-2 space-y-2" data-testid="note-fixes" data-note-id={note.id}>
      <div className="flex flex-wrap items-center gap-2">
        {hasScene && (
          <button className={btn} data-testid="note-suggest-fixes" disabled={ai.busy || !ai.available} onClick={() => void suggest()}>
            {ai.busy ? "Thinking of fixes..." : fixes || accepted ? "Suggest other fixes" : "Suggest fixes"}
          </button>
        )}
        {note.category === "format" && <FixFormattingButton host={host} className={btn} />}
        {!hasScene && note.category !== "format" && <span className="text-[11px] text-neutral-500">About the script as a whole: no single scene to change.</span>}
      </div>
      <AiNotices ai={ai} showTestBanner={false} />
      {message && (
        <p role="status" data-testid="note-fix-message" className="text-xs text-neutral-700">
          {message}
        </p>
      )}
      {fixes && ctx && fixes.length > 0 && (
        <ol className="space-y-2">
          {fixes.map((fix, i) => (
            <li key={i} data-testid="note-fix" className="border border-neutral-300 rounded p-2 bg-neutral-50 space-y-1.5">
              <p className="text-xs font-medium">
                Fix {i + 1}: <span className="font-normal">{fix.summary}</span>
              </p>
              {fixEdits(ctx, fix).map(e => (
                <div key={e.id} data-testid="note-fix-edit" data-element-id={e.id} data-kind={e.after === null ? "remove" : "replace"} className="bg-white border border-neutral-200 rounded p-1.5">
                  <p className="text-[10px] uppercase text-neutral-500">
                    {TYPE_LABEL[e.type]}
                    {e.after === null ? ": removed" : ""}
                  </p>
                  {e.after === null ? (
                    <p className="text-sm font-mono whitespace-pre-wrap">
                      <del className="bg-red-100 text-red-800">{e.before}</del>
                    </p>
                  ) : (
                    <>
                      <WordDiff before={e.before} after={e.after} side="before" />
                      <WordDiff before={e.before} after={e.after} side="after" />
                    </>
                  )}
                </div>
              ))}
              <div className="flex gap-2">
                <button className={primary} data-testid="note-fix-accept" onClick={() => accept(fix)}>
                  Accept this fix
                </button>
                <button className={btn} data-testid="note-fix-show" onClick={() => onJumpTo(fixEdits(ctx, fix)[0]?.id ?? ctx.sceneId)}>
                  Show in script
                </button>
              </div>
            </li>
          ))}
        </ol>
      )}
      {fixes && fixes.length > 0 && (
        <button className={btn} data-testid="note-fix-dismiss" onClick={() => setFixes(null)}>
          Dismiss fixes
        </button>
      )}
    </div>
  );
}
