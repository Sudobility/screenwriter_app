import { useState } from "react";
import type { ScriptEditorHost } from "@sudobility/writing_ui";
import type { AssistantRole, VoiceProfile } from "@sudobility/screenwriter_types";
import { useAiActions } from "../hooks/useAiActions";
import { characterLines } from "../util/character-lines";
import { AiNotices } from "./AiNotices";

const primary = "bg-neutral-900 text-white rounded px-3 py-1 text-sm hover:bg-neutral-800 disabled:opacity-50";
const HISTORY_TURNS = 8;

type Msg = { role: AssistantRole; text: string };

const profileText = (p: VoiceProfile | null): string | undefined => {
  if (!p) return undefined;
  const s = [p.summary, p.vocabulary, p.rhythm, p.tics].map(x => x?.trim()).filter(Boolean).join("\n");
  return s ? s.slice(0, 2_000) : undefined;
};

/**
 * Interview a character: a chat role-played in their voice, grounded in their own lines (and voice profile, if one
 * has been generated). Read-only — a way to test a character's voice and motives, never a change to the script.
 */
export function CharacterInterviewBox({ host, name, aliases, profile }: {
  host: ScriptEditorHost;
  name: string;
  aliases: string[];
  profile: VoiceProfile | null;
}) {
  const ai = useAiActions();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [draft, setDraft] = useState("");

  const ask = async () => {
    const question = draft.trim();
    if (!question) return;
    const history = messages.slice(-HISTORY_TURNS).map(m => ({ role: m.role, text: m.text }));
    setMessages(prev => [...prev, { role: "user", text: question }]);
    setDraft("");
    const lines = characterLines(host, [name, ...aliases]);
    const res = await ai.run(client => client.characterInterview({ name, question, lines, ...(profileText(profile) ? { profile: profileText(profile) } : {}), history }));
    if (res) setMessages(prev => [...prev, { role: "assistant", text: res.result.answer }]);
  };

  return (
    <section className="space-y-2" data-testid="ai-interview-box">
      <h4 className="text-xs font-semibold uppercase text-neutral-500">Interview {name}</h4>
      <p className="text-xs text-neutral-600">Ask {name} a question; they answer in character. Read-only — it never changes the script.</p>
      {messages.length > 0 && (
        <ul className="max-h-56 space-y-2 overflow-y-auto rounded border border-neutral-200 bg-white p-2 text-xs" data-testid="ai-interview-messages">
          {messages.map((m, i) => (
            <li key={i} data-testid="ai-interview-message" data-role={m.role}>
              <p className={m.role === "user" ? "font-medium" : "whitespace-pre-wrap text-neutral-800"}>
                {m.role === "user" ? "You: " : `${name}: `}
                {m.text}
              </p>
            </li>
          ))}
        </ul>
      )}
      <AiNotices ai={ai} showTestBanner={false} />
      <div className="flex gap-1">
        <input
          className="flex-1 rounded border border-neutral-300 px-2 py-1 text-xs"
          data-testid="ai-interview-input"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          placeholder={`Ask ${name} something…`}
          disabled={ai.busy}
          onKeyDown={e => { if (e.key === "Enter") void ask(); }}
        />
        <button className={primary} data-testid="ai-interview-send" disabled={ai.busy || !ai.available || !draft.trim()} onClick={() => void ask()}>
          {ai.busy ? "…" : "Ask"}
        </button>
      </div>
    </section>
  );
}
