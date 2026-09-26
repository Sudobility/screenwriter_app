import { useState } from "react";
import type { GenerateScriptResult } from "@sudobility/screenwriter_types";
import type { ScriptEditorHost } from "@sudobility/writing_ui";
import { useAiActions } from "../hooks/useAiActions";
import { headingText, insertScript } from "../util/ai-script";
import { AiNotices } from "./AiNotices";

const btn = "border border-neutral-300 rounded px-2 py-1 text-xs hover:bg-neutral-100 disabled:opacity-50";
const primary = "bg-neutral-900 text-white rounded px-3 py-1 text-sm hover:bg-neutral-800 disabled:opacity-50";
const STORY_MAX = 30_000;

/**
 * "Generate script from a story": the writer tells the story in plain language, the AI returns scenes with
 * structured headings and typed elements (action, character, parenthetical, dialogue, transition). It is shown as
 * a preview first; "Insert into script" writes it through ordinary editor commands — into the empty starter
 * element of a new document, or after the last element of an existing one — so it can be undone like any edit.
 */
export function GenerateScriptSection({ host, onInserted }: { host: ScriptEditorHost; onInserted(firstElementId: string): void }) {
  const ai = useAiActions();
  const [story, setStory] = useState("");
  const [title, setTitle] = useState("");
  const [script, setScript] = useState<GenerateScriptResult | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const generate = async () => {
    setNote(null);
    setScript(null);
    const res = await ai.run(client => client.generateScript({ story, ...(title.trim() ? { title: title.trim() } : {}) }));
    if (res) setScript(res.result);
  };

  const insert = () => {
    if (!script) return;
    const r = insertScript(host, script);
    setNote(
      `Inserted ${r.written} element${r.written === 1 ? "" : "s"}.` +
        (r.skipped > 0 ? ` ${r.skipped} skipped because this template has no style for them.` : "") +
        " You can undo this from the editor."
    );
    setScript(null);
    setStory("");
    if (r.firstId) onInserted(r.firstId);
  };

  return (
    <section className="space-y-2" data-testid="ai-generate-section">
      <h3 className="text-xs font-semibold uppercase text-neutral-500">Generate script</h3>
      <p className="text-xs text-neutral-600">
        Tell the story in plain words; the AI writes it as a screenplay you can review before it goes into the script. Longer stories cost more credits.
      </p>
      <label className="flex flex-col text-xs text-neutral-500">
        Story
        <textarea
          spellCheck={true}
          autoCorrect="off"
          rows={6}
          data-testid="ai-story"
          className="border border-neutral-300 rounded px-2 py-1 text-sm bg-white text-neutral-900"
          placeholder="e.g. A lighthouse keeper finds a door in the rock one stormy night..."
          value={story}
          maxLength={STORY_MAX}
          onChange={e => setStory(e.target.value)}
        />
      </label>
      <label className="flex flex-col text-xs text-neutral-500">
        Title (optional)
        <input
          spellCheck={true}
          autoCorrect="off"
          data-testid="ai-story-title"
          className="border border-neutral-300 rounded px-2 py-1 text-sm bg-white text-neutral-900"
          value={title}
          maxLength={120}
          onChange={e => setTitle(e.target.value)}
        />
      </label>
      <button className={primary} data-testid="ai-generate-script" disabled={ai.busy || !story.trim() || !ai.available} onClick={() => void generate()}>
        {ai.busy ? "Writing the script..." : "Generate script"}
      </button>
      <AiNotices ai={ai} showCredits showTestBanner={false} />
      {note && (
        <p role="status" data-testid="ai-generate-note" className="text-xs text-neutral-700">
          {note}
        </p>
      )}

      {script && (
        <div className="space-y-2" data-testid="ai-script-preview">
          {script.title && <p className="text-sm font-semibold">{script.title}</p>}
          <ol className="space-y-2">
            {script.scenes.map((s, i) => (
              <li key={i} data-testid="ai-script-scene" className="border border-neutral-200 rounded p-2 bg-white space-y-1">
                <p className="text-xs font-semibold">{headingText(s.heading)}</p>
                <div className="text-xs space-y-0.5">
                  {s.elements.map((e, j) => (
                    <p
                      key={j}
                      className={
                        e.type === "character"
                          ? "font-semibold pl-8 pt-1"
                          : e.type === "dialogue"
                            ? "pl-4"
                            : e.type === "parenthetical"
                              ? "pl-6 italic"
                              : e.type === "transition"
                                ? "text-right"
                                : ""
                      }
                    >
                      {e.text}
                    </p>
                  ))}
                </div>
              </li>
            ))}
          </ol>
          <div className="flex gap-2">
            <button className={primary} data-testid="ai-script-insert" onClick={insert}>
              Insert into script
            </button>
            <button className={btn} data-testid="ai-script-discard" onClick={() => setScript(null)}>
              Discard
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
