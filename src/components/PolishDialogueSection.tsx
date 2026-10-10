import { useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@sudobility/components";
import type { EntityView } from "@sudobility/writing_core";
import type { ScriptEditorHost } from "@sudobility/writing_ui";
import { useAiActions } from "../hooks/useAiActions";
import { applyLineEdits, dialogueOf, scenesSpokenIn, type DialogueLine } from "../util/ai-script";
import { getOwnSkeleton, getStages, skeletonForAi, stageLabel } from "../util/character-skeleton";
import { AiNotices } from "./AiNotices";
import { WordDiff } from "./WordDiff";

const btn = "border border-neutral-300 rounded px-2 py-1 text-sm bg-white hover:bg-neutral-100 disabled:opacity-40";
const ALL = "all";

interface Proposal {
  line: DialogueLine;
  after: string;
}

/**
 * "Polish dialogue" for one character: all of their lines (or those in one scene) are sent with their skeleton, and
 * come back reworded to fit the personality. Nothing changes until the writer applies the lines they want, one by
 * one, as a before/after diff; a line edited in the meantime is skipped, never overwritten. A character with life
 * stages picks which stage's personality to write as.
 */
export function PolishDialogueSection({ host, entity }: { host: ScriptEditorHost; entity: EntityView }) {
  const ai = useAiActions();
  const stages = getStages(entity);
  const scenes = scenesSpokenIn(host, entity);
  const [scope, setScope] = useState(ALL);
  const [stageId, setStageId] = useState<string>("");
  const [intensity, setIntensity] = useState<"light" | "medium" | "bold">("medium");
  const [proposals, setProposals] = useState<Proposal[] | null>(null);
  const [unticked, setUnticked] = useState<ReadonlySet<string>>(new Set());
  const [note, setNote] = useState<string | null>(null);

  const lines = dialogueOf(host, entity, scope === ALL ? undefined : scope);
  const usable = lines.slice(0, 100);
  const stage = stages.find(s => s.id === (stageId || stages[0]?.id));
  const skeleton = skeletonForAi(stages.length > 0 ? (stage?.skeleton ?? {}) : getOwnSkeleton(entity));
  const hasSkeleton = skeleton.age !== "unspecified" || Object.keys(skeleton).length > 1;

  const polish = async () => {
    setNote(null);
    setProposals(null);
    const res = await ai.run(client => client.polishCharacterDialogue({ character: entity.name, skeleton, dialogues: usable.map(l => ({ id: l.id, text: l.text })), intensity }));
    if (!res) return;
    const byId = new Map(usable.map(l => [l.id, l]));
    const next = res.result.dialogues.flatMap(d => {
      const line = byId.get(d.id);
      return line && d.text.trim() !== line.text.trim() ? [{ line, after: d.text }] : [];
    });
    setProposals(next);
    setUnticked(new Set());
    if (next.length === 0) setNote("The AI found nothing worth changing: these lines already fit.");
  };

  const chosen = (proposals ?? []).filter(p => !unticked.has(p.line.id));
  const apply = () => {
    const r = applyLineEdits(host, chosen.map(p => ({ id: p.line.id, before: p.line.text, after: p.after })));
    setNote(
      `Applied ${r.applied.length} line${r.applied.length === 1 ? "" : "s"}.` +
        (r.stale.length > 0 ? ` ${r.stale.length} skipped because the line changed since the AI saw it.` : "") +
        " You can undo this from the editor."
    );
    setProposals(null);
  };

  return (
    <div className="space-y-2" data-testid="polish-dialogue">
      <h4 className="text-xs font-semibold uppercase text-neutral-500">Polish dialogue with this character&apos;s skeleton</h4>
      <p className="text-xs text-neutral-500">
        Rewords {entity.name}&apos;s lines to fit who they are. You review every change before it is applied.
      </p>

      <div className="flex flex-wrap gap-2 items-end">
        {scenes.length > 1 && (
          <label className="flex flex-col text-xs text-neutral-500">
            Lines from
            <Select value={scope} onValueChange={setScope}>
              <SelectTrigger aria-label="Lines from" data-testid="polish-scope" className="w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All scenes</SelectItem>
                {scenes.map(s => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.heading || "(untitled scene)"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
        )}
        {stages.length > 0 && (
          <label className="flex flex-col text-xs text-neutral-500">
            Write as
            <Select value={stageId || stages[0]!.id} onValueChange={setStageId}>
              <SelectTrigger aria-label="Write as" data-testid="polish-stage" className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {stages.map(s => (
                  <SelectItem key={s.id} value={s.id}>
                    Age {stageLabel(s)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
        )}
        <label className="flex flex-col text-xs text-neutral-500">
          How much
          <Select value={intensity} onValueChange={v => setIntensity(v as typeof intensity)}>
            <SelectTrigger aria-label="How much" data-testid="polish-intensity" className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="light">Light</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="bold">Bold</SelectItem>
            </SelectContent>
          </Select>
        </label>
        <button className={btn} data-testid="polish-dialogue-run" disabled={ai.busy || usable.length === 0 || !ai.available} onClick={() => void polish()}>
          {ai.busy ? "Polishing..." : `Polish ${usable.length} line${usable.length === 1 ? "" : "s"}`}
        </button>
      </div>
      {!hasSkeleton && <p className="text-xs text-amber-800">No skeleton filled in yet, so the AI has only the name to go on. Add details above for better results.</p>}
      {usable.length === 0 && <p className="text-xs text-neutral-500">{entity.name} has no dialogue in the script yet.</p>}
      {lines.length > usable.length && <p className="text-xs text-neutral-500">Only the first {usable.length} of {lines.length} lines are sent at once.</p>}

      <AiNotices ai={ai} showCredits />
      {note && (
        <p role="status" data-testid="polish-note" className="text-xs text-neutral-700">
          {note}
        </p>
      )}

      {proposals && proposals.length > 0 && (
        <div className="space-y-2" data-testid="polish-proposals">
          <ul className="space-y-2">
            {proposals.map(p => (
              <li key={p.line.id} data-testid="polish-proposal" data-line-id={p.line.id} className="border border-neutral-200 rounded p-2 bg-white space-y-1">
                <label className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    aria-label="Apply this line"
                    checked={!unticked.has(p.line.id)}
                    onChange={() =>
                      setUnticked(u => {
                        const n = new Set(u);
                        if (!n.delete(p.line.id)) n.add(p.line.id);
                        return n;
                      })
                    }
                  />
                  <span className="text-neutral-500">{p.line.sceneHeading}</span>
                </label>
                <WordDiff before={p.line.text} after={p.after} side="before" />
                <WordDiff before={p.line.text} after={p.after} side="after" />
              </li>
            ))}
          </ul>
          <div className="flex gap-2">
            <button className="bg-neutral-900 text-white rounded px-3 py-1 text-sm disabled:opacity-50" data-testid="polish-apply" disabled={chosen.length === 0} onClick={apply}>
              Apply {chosen.length} line{chosen.length === 1 ? "" : "s"}
            </button>
            <button className={btn} data-testid="polish-discard" onClick={() => setProposals(null)}>
              Discard
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
