import { useMemo, useState } from "react";
import type { ScriptEditorHost } from "@sudobility/writing_ui";
import type { AssistantRole } from "@sudobility/screenwriter_types";
import { useAiActions } from "../hooks/useAiActions";
import { AiNotices } from "./AiNotices";

const primary = "bg-neutral-900 text-white rounded px-3 py-1 text-sm hover:bg-neutral-800 disabled:opacity-50";

const MAX_SCENES = 160;
const SCENE_TEXT_MAX = 1_500;
const HISTORY_TURNS = 8;

type Msg = { role: AssistantRole; text: string; refs?: { sceneId: string; why: string }[] };

function sceneInputs(host: ScriptEditorHost) {
  return host.model
    .scenes()
    .map(s => {
      const parts: string[] = [];
      for (const id of s.elementIds) {
        if (id === s.id) continue;
        const t = host.model.element(id)?.text.plain.trim();
        if (t) parts.push(t);
      }
      return { id: String(s.id), heading: s.headingText || "", text: parts.join(" ").slice(0, SCENE_TEXT_MAX) };
    })
    .filter(s => s.heading || s.text)
    .slice(0, MAX_SCENES);
}

/**
 * A read-only assistant that answers questions about the script ("who knows about the gun by scene 20?",
 * "list the night scenes", "summarise Maya's arc"), grounded in the scenes and citing them as jump links.
 * It does not change the script.
 */
export function AssistantSection({ host, onJumpTo }: { host: ScriptEditorHost; onJumpTo(sceneId: string): void }) {
  const ai = useAiActions();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [draft, setDraft] = useState("");

  const scenes = host.model.scenes();
  const headingOf = useMemo(() => new Map(scenes.map(s => [String(s.id), s.headingText || "Untitled scene"])), [scenes]);

  const ask = async () => {
    const question = draft.trim();
    if (!question) return;
    const history = messages.slice(-HISTORY_TURNS).map(m => ({ role: m.role, text: m.text }));
    setMessages(prev => [...prev, { role: "user", text: question }]);
    setDraft("");
    const inputs = sceneInputs(host);
    if (inputs.length === 0) {
      setMessages(prev => [...prev, { role: "assistant", text: "There is no script yet to ask about." }]);
      return;
    }
    const res = await ai.run(client => client.assistant({ question, scenes: inputs, history }));
    if (res) setMessages(prev => [...prev, { role: "assistant", text: res.result.answer, refs: res.result.references }]);
  };

  return (
    <section className="space-y-2" data-testid="ai-assistant-section">
      <h3 className="text-xs font-semibold uppercase text-neutral-500">Ask about the script</h3>
      <p className="text-xs text-neutral-600">Questions only — the assistant answers from the script and cites scenes. It never changes the script.</p>
      {messages.length > 0 && (
        <ul className="max-h-64 space-y-2 overflow-y-auto rounded border border-neutral-200 bg-white p-2 text-xs" data-testid="ai-assistant-messages">
          {messages.map((m, i) => (
            <li key={i} data-testid="ai-assistant-message" data-role={m.role}>
              <p className={m.role === "user" ? "font-medium" : "whitespace-pre-wrap"}>
                {m.role === "user" ? "You: " : ""}
                {m.text}
              </p>
              {m.refs && m.refs.length > 0 && (
                <div className="mt-0.5 flex flex-wrap gap-1">
                  {m.refs.map(r => (
                    <button key={r.sceneId} type="button" data-testid="ai-assistant-ref" className="rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] hover:bg-neutral-200" title={r.why} onClick={() => onJumpTo(r.sceneId)}>
                      {headingOf.get(r.sceneId) ?? r.sceneId}
                    </button>
                  ))}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      <AiNotices ai={ai} showTestBanner={false} />
      <div className="flex gap-1">
        <input
          className="flex-1 rounded border border-neutral-300 px-2 py-1 text-xs"
          data-testid="ai-assistant-input"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          placeholder="Ask a question about the script…"
          disabled={ai.busy}
          onKeyDown={e => { if (e.key === "Enter") void ask(); }}
        />
        <button className={primary} data-testid="ai-assistant-send" disabled={ai.busy || !ai.available || !draft.trim()} onClick={() => void ask()}>
          {ai.busy ? "…" : "Ask"}
        </button>
      </div>
    </section>
  );
}
