import { useMemo, useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@sudobility/components";
import type { ScriptElement } from "@sudobility/screenwriter_types";
import type { ScriptEditorHost } from "@sudobility/writing_ui";
import { useAiActions } from "../hooks/useAiActions";
import { useModelTick } from "../util/use-model-tick";
import { readScene, replaceSceneBody, speakersIn } from "../util/ai-script";
import { getOwnSkeleton, getStages, skeletonForAi, stageLabel } from "../util/character-skeleton";
import { AiNotices } from "./AiNotices";

const btn = "border border-neutral-300 rounded px-2 py-1 text-xs hover:bg-neutral-100 disabled:opacity-50";
const primary = "bg-neutral-900 text-white rounded px-3 py-1 text-sm hover:bg-neutral-800 disabled:opacity-50";

const TYPE_CLASS: Record<ScriptElement["type"], string> = {
  action: "",
  character: "font-semibold pl-8 pt-1",
  dialogue: "pl-4",
  parenthetical: "pl-6 italic",
  transition: "text-right",
};

function ElementList({ elements, testId }: { elements: ScriptElement[]; testId: string }) {
  return (
    <div className="text-xs space-y-0.5" data-testid={testId}>
      {elements.map((e, i) => (
        <p key={i} className={TYPE_CLASS[e.type]}>
          {e.text}
        </p>
      ))}
    </div>
  );
}

interface Proposal {
  before: ScriptElement[];
  after: ScriptElement[];
  sceneId: string;
}

/**
 * "Polish scene with the characters' skeletons": the current scene goes to the AI with a skeleton for every
 * character who speaks in it, and comes back freely rewritten (dialogue and action) to fit their personalities. The
 * writer sees before and after side by side and chooses to replace the scene or discard; a scene edited in the
 * meantime is never replaced. A character with life stages chooses which stage's personality applies.
 */
export function PolishSceneSection({ host, scene }: { host: ScriptEditorHost; scene: { id: string; heading: string } | null }) {
  useModelTick(host);
  const ai = useAiActions();
  const [intensity, setIntensity] = useState<"light" | "medium" | "bold">("medium");
  const [stagePick, setStagePick] = useState<Record<string, string>>({});
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const read = scene ? readScene(host, scene.id) : null;
  const speakers = useMemo(() => (scene ? speakersIn(host, scene.id) : []), [host, scene, read?.elements.length]);

  const characters = speakers.map(e => {
    const stages = getStages(e);
    const stage = stages.find(s => s.id === (stagePick[e.id] ?? stages[0]?.id));
    const skeleton = skeletonForAi(stages.length > 0 ? (stage?.skeleton ?? {}) : getOwnSkeleton(e));
    return { entity: e, stages, skeleton, known: skeleton.age !== "unspecified" || Object.keys(skeleton).length > 1 };
  });
  const blocked = !scene || !read || read.elements.length === 0 || read.unsupported > 0 || characters.length === 0;

  const polish = async () => {
    if (!scene || !read) return;
    setNote(null);
    setProposal(null);
    const res = await ai.run(client =>
      client.polishScene({
        scene: { heading: read.heading, elements: read.elements },
        characters: characters.map(c => ({ name: c.entity.name, skeleton: c.skeleton })),
        intensity,
      })
    );
    if (res) setProposal({ before: read.elements, after: res.result.elements, sceneId: scene.id });
  };

  const replace = () => {
    if (!proposal) return;
    const ok = replaceSceneBody(host, proposal.sceneId, proposal.after, proposal.before);
    setNote(ok ? "Scene replaced. You can undo this from the editor." : "The scene changed since the AI saw it, so nothing was replaced. Polish it again.");
    setProposal(null);
  };

  return (
    <section className="space-y-2" data-testid="ai-polish-scene-section">
      <h3 className="text-xs font-semibold uppercase text-neutral-500">Polish scene with characters</h3>
      <p className="text-xs text-neutral-600">
        Rewrites the current scene&apos;s dialogue and action to fit each speaking character&apos;s skeleton. You compare before and after, then replace or discard.
      </p>
      <p className="text-sm" data-testid="ai-polish-scene-scope">
        Scope: <strong>Current scene</strong>
        {scene ? <>: {scene.heading || "(untitled scene)"}</> : <span className="text-neutral-500"> (click in the script to choose a scene)</span>}
      </p>

      {scene && characters.length > 0 && (
        <ul className="space-y-1" data-testid="ai-scene-characters">
          {characters.map(c => (
            <li key={c.entity.id} className="flex items-center gap-2 text-xs">
              <span className="font-medium">{c.entity.name}</span>
              {c.stages.length > 0 ? (
                <Select value={stagePick[c.entity.id] ?? c.stages[0]!.id} onValueChange={v => setStagePick(p => ({ ...p, [c.entity.id]: v }))}>
                  <SelectTrigger aria-label={`${c.entity.name} age`} className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {c.stages.map(s => (
                      <SelectItem key={s.id} value={s.id}>
                        Age {stageLabel(s)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : null}
              {!c.known && <span className="text-amber-800">no skeleton yet</span>}
            </li>
          ))}
        </ul>
      )}
      {scene && read && read.unsupported > 0 && (
        <p className="text-xs text-amber-800" data-testid="ai-scene-unsupported">
          This scene has notes or other elements the AI cannot carry, so replacing it would lose them. Move them out first.
        </p>
      )}
      {scene && characters.length === 0 && <p className="text-xs text-neutral-500">No character speaks in this scene yet.</p>}

      <div className="flex items-end gap-2">
        <label className="flex flex-col text-xs text-neutral-500">
          How much
          <Select value={intensity} onValueChange={v => setIntensity(v as typeof intensity)}>
            <SelectTrigger aria-label="Scene polish intensity" className="w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="light">Light</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="bold">Bold</SelectItem>
            </SelectContent>
          </Select>
        </label>
        <button className={primary} data-testid="ai-polish-scene-button" disabled={ai.busy || blocked || !ai.available} onClick={() => void polish()}>
          {ai.busy ? "Polishing..." : "Polish scene"}
        </button>
      </div>
      <AiNotices ai={ai} showCredits showTestBanner={false} />
      {note && (
        <p role="status" data-testid="ai-polish-scene-note" className="text-xs text-neutral-700">
          {note}
        </p>
      )}

      {proposal && (
        <div className="space-y-2" data-testid="ai-scene-proposal">
          <div>
            <div className="text-[10px] uppercase text-neutral-500">Before</div>
            <div className="border border-neutral-200 rounded p-2 bg-white">
              <ElementList elements={proposal.before} testId="ai-scene-before" />
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase text-neutral-500">After</div>
            <div className="border border-green-300 rounded p-2 bg-white">
              <ElementList elements={proposal.after} testId="ai-scene-after" />
            </div>
          </div>
          <div className="flex gap-2">
            <button className={primary} data-testid="ai-scene-replace" onClick={replace}>
              Replace scene
            </button>
            <button className={btn} data-testid="ai-scene-discard" onClick={() => setProposal(null)}>
              Discard
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
