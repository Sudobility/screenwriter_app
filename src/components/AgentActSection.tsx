import { useMemo, useState } from "react";
import type { ElementId } from "@sudobility/writing_core";
import type { ScriptEditorHost } from "@sudobility/writing_ui";
import type { AgentActResult, AgentOperation } from "@sudobility/screenwriter_types";
import { useAiActions } from "../hooks/useAiActions";
import { characterNames, characterCues } from "../util/character-lines";
import { AiNotices } from "./AiNotices";

const primary = "bg-neutral-900 text-white rounded px-3 py-1 text-sm hover:bg-neutral-800 disabled:opacity-50";
const apply = "rounded border border-neutral-300 bg-white px-2 py-0.5 text-xs hover:bg-neutral-100 disabled:opacity-40";

const MAX_SCENES = 160;
const SCENE_TEXT_MAX = 1_500;

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

const describe = (op: AgentOperation): string =>
  op.kind === "comment"
    ? `Comment (${op.category}): ${op.body}${op.suggestion ? ` — ${op.suggestion}` : ""}`
    : `Rename character “${op.from}” → “${op.to}” everywhere`;

/**
 * The AI agent that can ACT: it turns an instruction into a plan and a list of typed operations (flag a scene with a
 * comment, rename a character). It never changes anything on its own — the writer applies each operation with its
 * own button, and every apply is an ordinary undoable command.
 */
export function AgentActSection({ host, onJumpTo }: { host: ScriptEditorHost; onJumpTo(sceneId: string): void }) {
  const ai = useAiActions();
  const [instruction, setInstruction] = useState("");
  const [result, setResult] = useState<AgentActResult | null>(null);
  const [done, setDone] = useState<Record<number, string>>({});

  const headingOf = useMemo(() => new Map(host.model.scenes().map(s => [String(s.id), s.headingText || "a scene"])), [host, result]);

  const propose = async () => {
    const text = instruction.trim();
    if (!text) return;
    setResult(null);
    setDone({});
    const scenes = sceneInputs(host);
    if (scenes.length === 0) return;
    const res = await ai.run(client => client.agentAct({ instruction: text, scenes, characters: characterNames(host) }));
    if (res) setResult(res.result);
  };

  const applyOp = (op: AgentOperation, i: number) => {
    const local = { kind: "local-command" } as const;
    if (op.kind === "comment") {
      const r = host.execute([{ id: "note.add", params: { anchor: { kind: "scene", elementId: op.sceneId }, body: op.body, category: op.category, source: "ai", ...(op.suggestion ? { suggestion: op.suggestion } : {}) } }], local);
      setDone(d => ({ ...d, [i]: r.ok ? "Comment added." : "Could not add the comment." }));
      if (r.ok) onJumpTo(op.sceneId);
      return;
    }
    // rename-character: rewrite every matching cue to the new name (upper-cased), each an undoable edit.
    const cues = characterCues(host, op.from);
    const to = op.to.trim().toUpperCase();
    let n = 0;
    for (const cue of cues) {
      const range = { anchor: { elementId: cue.id, offset: 0 }, head: { elementId: cue.id, offset: cue.text.length } };
      if (host.execute([{ id: "text.replaceRange", params: { range, text: to } }], local).ok) n++;
    }
    setDone(d => ({ ...d, [i]: n > 0 ? `Renamed ${n} cue${n === 1 ? "" : "s"}.` : "No matching cues to rename." }));
  };

  return (
    <section className="space-y-2" data-testid="ai-agent-section">
      <h3 className="text-xs font-semibold uppercase text-neutral-500">Ask the AI to act</h3>
      <p className="text-xs text-neutral-600">Describe a change (“flag the slow scenes”, “rename Quinn to Quinlan”). The AI proposes steps; nothing happens until you apply each one.</p>
      <div className="flex gap-1">
        <input
          className="flex-1 rounded border border-neutral-300 px-2 py-1 text-xs"
          data-testid="ai-agent-input"
          value={instruction}
          onChange={e => setInstruction(e.target.value)}
          placeholder="What should the AI do?"
          disabled={ai.busy}
          onKeyDown={e => { if (e.key === "Enter") void propose(); }}
        />
        <button className={primary} data-testid="ai-agent-propose" disabled={ai.busy || !ai.available || !instruction.trim()} onClick={() => void propose()}>
          {ai.busy ? "…" : "Propose"}
        </button>
      </div>
      <AiNotices ai={ai} showTestBanner={false} />
      {result && (
        <div className="space-y-2 rounded border border-neutral-200 bg-white p-2" data-testid="ai-agent-result">
          <p className="text-xs text-neutral-700" data-testid="ai-agent-message">{result.message}</p>
          {result.operations.length === 0 ? (
            <p className="text-xs text-neutral-500">No actions proposed.</p>
          ) : (
            <ul className="space-y-1">
              {result.operations.map((op, i) => (
                <li key={i} data-testid="ai-agent-op" data-kind={op.kind} className="flex items-start gap-2 rounded bg-neutral-50 p-1.5 text-xs">
                  <span className="flex-1">
                    {op.kind === "comment" ? describe(op).replace(op.sceneId, headingOf.get(op.sceneId) ?? op.sceneId) : describe(op)}
                    {done[i] && <span className="ml-1 text-neutral-500" data-testid="ai-agent-op-done">✓ {done[i]}</span>}
                  </span>
                  <button className={apply} data-testid="ai-agent-op-apply" disabled={!!done[i]} onClick={() => applyOp(op, i)}>
                    Apply
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
