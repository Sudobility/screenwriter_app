import { useState } from "react";
import type { ElementId } from "@sudobility/writing_core";
import { useEditorSelection, type ScriptEditorHost } from "@sudobility/writing_ui";
import { useAiActions } from "../hooks/useAiActions";
import { noteFixContext, type NoteFixContext } from "../util/note-fix";
import { AiNotices } from "./AiNotices";

const primary = "bg-neutral-900 text-white rounded px-3 py-1 text-sm hover:bg-neutral-800 disabled:opacity-50";

/**
 * Line alternates: several AI rewrites of the line under the caret. The writer picks one and it replaces the line
 * (as an ordinary command). It is not stored as a persistent alternate — picking one is a plain text replacement,
 * refused if the line changed since the AI saw it.
 */
export function AlternatesSection({ host, onJumpTo }: { host: ScriptEditorHost; onJumpTo(sceneId: string): void }) {
  const ai = useAiActions();
  const selection = useEditorSelection(host);
  const targetId = selection?.head.elementId ? String(selection.head.elementId) : undefined;
  const [state, setState] = useState<{ ctx: NoteFixContext; targetId: string; stored: string; options: string[] } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const run = async () => {
    setState(null);
    setMsg(null);
    if (!targetId) {
      setMsg("Put the caret on a line first.");
      return;
    }
    const scene = host.model.sceneOf(targetId as ElementId);
    const ctx = noteFixContext(host, { title: "Alternates", body: "Line alternates", category: "pacing", anchors: [] }, scene ? String(scene.id) : undefined);
    if (!ctx || !ctx.seen.has(targetId)) {
      setMsg("Put the caret on an action, dialogue or similar line.");
      return;
    }
    const res = await ai.run(client => client.lineAlternates({ scene: ctx.request.scene, targetId, count: 3 }));
    if (res) setState({ ctx, targetId, stored: ctx.seen.get(targetId)!.stored, options: res.result.alternates });
  };

  const choose = (text: string) => {
    if (!state) return;
    if (host.model.element(state.targetId as ElementId)?.text.plain !== state.stored) {
      setState(null);
      setMsg("The line changed since — generate alternates again.");
      return;
    }
    const range = { anchor: { elementId: state.targetId, offset: 0 }, head: { elementId: state.targetId, offset: state.stored.length } };
    const ok = host.execute([{ id: "text.replaceRange", params: { range, text } }], { kind: "local-command" }).ok;
    setState(null);
    if (ok) {
      setMsg("Line replaced.");
      onJumpTo(state.ctx.sceneId);
    } else setMsg("Could not replace the line.");
  };

  return (
    <section className="space-y-2" data-testid="ai-alternates-section">
      <h3 className="text-xs font-semibold uppercase text-neutral-500">Alternate lines</h3>
      <p className="text-xs text-neutral-600">A few other ways to write the line under the caret. Pick one to replace it.</p>
      <button className={primary} data-testid="ai-alternates-button" disabled={ai.busy || !ai.available} onClick={() => void run()}>
        {ai.busy ? "…" : "Suggest alternates"}
      </button>
      <AiNotices ai={ai} showTestBanner={false} />
      {msg && <p className="text-xs text-neutral-500" data-testid="ai-alternates-msg">{msg}</p>}
      {state && (
        <ul className="space-y-1" data-testid="ai-alternates-options">
          {state.options.map((o, i) => (
            <li key={i}>
              <button type="button" data-testid="ai-alternates-option" className="w-full rounded border border-neutral-200 bg-white p-1.5 text-left text-xs hover:bg-neutral-50" onClick={() => choose(o)}>
                {o}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
