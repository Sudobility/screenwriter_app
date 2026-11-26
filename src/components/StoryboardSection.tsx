import { useEffect, useRef, useState } from "react";
import { PlusIcon, TrashIcon } from "@heroicons/react/24/outline";
import { useScreenwriter } from "@sudobility/screenwriter_lib";
import type { ScriptEditorHost } from "@sudobility/writing_ui";
import { useModelTick } from "../util/use-model-tick";
import { useAiActions } from "../hooks/useAiActions";
import {
  generateStoryboardFrame,
  getSceneStoryboard,
  removeStoryboard,
  type StoryboardMeta,
  type StoryboardScene,
} from "../util/storyboards";
import { readScene } from "../util/ai-script";
import { AiNotices } from "./AiNotices";
import { btn, primary } from "./ai/shared";

type ShotStatus = "idle" | "busy" | "done" | "error";
interface PlanShot {
  key: string;
  description: string;
  lines?: number[];
  status: ShotStatus;
}

let shotKeySeq = 0;
const nextKey = () => `shot_${++shotKeySeq}`;

/**
 * The AI "Generate storyboard" options screen, in two steps: first propose a shot list from the scene (one AI call),
 * then — after the writer edits, adds or removes shots — draw the frames one by one or all at once. Frames are
 * APPENDED to the scene's storyboard; an optional "Remove existing storyboard" clears the old frames first.
 */
export function StoryboardSection({ host, documentId, scene, onView }: {
  host: ScriptEditorHost;
  documentId: string;
  scene: { id: string; heading: string } | null;
  /** Open the scene's storyboard in the detail pane. */
  onView?(sceneId: string): void;
}) {
  useModelTick(host);
  const sw = useScreenwriter();
  const ai = useAiActions();
  const [instructions, setInstructions] = useState("");
  const [plan, setPlan] = useState<StoryboardMeta | null>(null);
  const [shots, setShots] = useState<PlanShot[]>([]);
  const [sceneRead, setSceneRead] = useState<StoryboardScene | null>(null);
  const [removeExisting, setRemoveExisting] = useState(false);
  const [generatingAll, setGeneratingAll] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Whether the "remove existing" clear has already run this generation pass (so it happens once, before the first frame).
  const removedRef = useRef(false);

  const sceneId = scene?.id ?? null;
  const existing = sceneId ? getSceneStoryboard(host, sceneId) : null;
  const existingCount = existing?.images.length ?? 0;

  // A new scene selection invalidates the proposed plan (its line numbers refer to the scene it was made from).
  useEffect(() => {
    setPlan(null);
    setShots([]);
    setSceneRead(null);
    setRemoveExisting(false);
    removedRef.current = false;
    setError(null);
  }, [sceneId]);

  const anyBusy = ai.busy || generatingAll || shots.some(s => s.status === "busy");
  const doneCount = shots.filter(s => s.status === "done").length;

  const propose = async () => {
    if (!scene) return;
    const read = readScene(host, scene.id);
    if (!read || read.elements.length === 0) return;
    setError(null);
    const trimmed = instructions.trim() || undefined;
    const res = await ai.run(client =>
      client.storyboardFromScene({ scene: { heading: read.heading || undefined, elements: read.elements }, ...(trimmed ? { instructions: trimmed } : {}) }),
    );
    if (!res) return; // consent needed, or an error surfaced by AiNotices
    setPlan({ shortTitle: res.result.shortTitle, detailedDescription: res.result.detailedDescription, instructions: trimmed });
    setShots(res.result.shots.map(s => ({ key: nextKey(), description: s.description, lines: s.lines, status: "idle" as const })));
    setSceneRead({ heading: read.heading || undefined, elements: read.elements });
    setRemoveExisting(false);
    removedRef.current = false;
  };

  // Clear the existing storyboard once, before the first frame, when the writer asked to replace it.
  const ensureRemoved = async () => {
    if (removeExisting && !removedRef.current && sceneId && getSceneStoryboard(host, sceneId)) {
      await removeStoryboard(sw, host, documentId, sceneId);
    }
    removedRef.current = true;
  };

  const drawFrame = async (shot: PlanShot) => {
    if (!scene || !sceneRead || !plan) return;
    setShots(cur => cur.map(s => (s.key === shot.key ? { ...s, status: "busy" } : s)));
    try {
      await ensureRemoved();
      await generateStoryboardFrame(sw, host, documentId, scene.id, {
        meta: plan,
        description: shot.description.trim(),
        lines: shot.lines,
        scene: sceneRead,
      });
      setShots(cur => cur.map(s => (s.key === shot.key ? { ...s, status: "done" } : s)));
    } catch (e) {
      setShots(cur => cur.map(s => (s.key === shot.key ? { ...s, status: "error" } : s)));
      setError(e instanceof Error ? e.message : "Could not generate that frame.");
      throw e;
    }
  };

  const generateOne = async (key: string) => {
    const shot = shots.find(s => s.key === key);
    if (!shot || shot.description.trim().length < 3) return;
    setError(null);
    await drawFrame(shot).catch(() => undefined);
  };

  const generateAll = async () => {
    if (!scene) return;
    setError(null);
    setGeneratingAll(true);
    try {
      for (const shot of shots) {
        if (shot.status === "done" || shot.description.trim().length < 3) continue;
        await drawFrame(shot).catch(() => undefined); // keep going; the error is surfaced per frame
      }
    } finally {
      setGeneratingAll(false);
    }
  };

  const setDesc = (key: string, value: string) =>
    setShots(cur => cur.map(s => (s.key === key ? { ...s, description: value } : s)));
  const addShot = () => setShots(cur => [...cur, { key: nextKey(), description: "", status: "idle" }]);
  const removeShot = (key: string) => setShots(cur => cur.filter(s => s.key !== key));

  const canView = !!onView && sceneId && (existingCount > 0 || doneCount > 0);

  return (
    <section className="space-y-3" data-testid="ai-storyboard-section">
      <h3 className="text-xs font-semibold uppercase text-neutral-500">Generate storyboard</h3>
      <p className="text-xs text-neutral-600">
        Propose the frames for the current scene, edit the list, then generate them as line-art images.
      </p>
      <p className="text-sm" data-testid="ai-storyboard-scope">
        Scene: {scene ? <strong>{scene.heading || "(untitled scene)"}</strong> : <span className="text-neutral-500">(click in the script to choose a scene)</span>}
      </p>

      {/* Step 1: propose */}
      <label className="flex flex-col gap-1 text-xs text-neutral-500">
        Additional instructions (optional)
        <textarea
          className="rounded border border-neutral-300 p-2 text-sm text-neutral-800"
          rows={2}
          value={instructions}
          onChange={e => setInstructions(e.target.value)}
          placeholder="Camera notes (e.g. 'static webcam'), mood, what to emphasise…"
          data-testid="ai-storyboard-instructions"
          disabled={anyBusy}
        />
      </label>
      <button className={primary} disabled={anyBusy || !scene || !ai.available} onClick={() => void propose()} data-testid="ai-storyboard-propose">
        {ai.busy ? "Proposing…" : plan ? "Re-propose shots" : "Propose shots"}
      </button>

      {/* Step 2: review / edit / generate */}
      {plan && (
        <div className="space-y-3" data-testid="ai-storyboard-plan">
          <p className="text-xs text-neutral-500">
            <strong className="text-neutral-700">{plan.shortTitle}</strong> — {shots.length} proposed frame{shots.length === 1 ? "" : "s"}. Edit, add or remove, then generate.
          </p>

          {existingCount > 0 && (
            <label className="flex items-center gap-2 text-xs text-neutral-700" data-testid="ai-storyboard-remove-existing">
              <input type="checkbox" checked={removeExisting} disabled={anyBusy} onChange={e => setRemoveExisting(e.target.checked)} />
              Remove the existing storyboard ({existingCount} frame{existingCount === 1 ? "" : "s"}) before generating
            </label>
          )}

          <ul className="space-y-2">
            {shots.map((s, i) => (
              <li key={s.key} className="rounded border border-neutral-200 bg-white p-2 space-y-1" data-testid="ai-storyboard-shot" data-status={s.status}>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-semibold uppercase text-neutral-400">Frame {i + 1}</span>
                  {s.lines && s.lines.length > 0 && <span className="text-[10px] text-neutral-400">lines {s.lines.join(", ")}</span>}
                  {s.status === "done" && <span className="text-[10px] font-medium text-green-700" data-testid="ai-storyboard-shot-done">drawn ✓</span>}
                  {s.status === "error" && <span className="text-[10px] font-medium text-red-700">failed</span>}
                  <span className="ml-auto flex items-center gap-1">
                    <button
                      className={btn}
                      disabled={anyBusy || s.description.trim().length < 3}
                      onClick={() => void generateOne(s.key)}
                      data-testid="ai-storyboard-shot-generate"
                    >
                      {s.status === "busy" ? "…" : s.status === "done" ? "Again" : "Generate"}
                    </button>
                    <button
                      className="text-neutral-400 hover:text-red-600 disabled:opacity-40"
                      title="Remove this frame from the list"
                      aria-label="Remove frame"
                      disabled={anyBusy}
                      onClick={() => removeShot(s.key)}
                      data-testid="ai-storyboard-shot-remove"
                    >
                      <TrashIcon className="h-4 w-4" />
                    </button>
                  </span>
                </div>
                <textarea
                  className="block w-full rounded border border-neutral-300 p-2 text-sm text-neutral-800"
                  rows={2}
                  value={s.description}
                  onChange={e => setDesc(s.key, e.target.value)}
                  disabled={anyBusy}
                  data-testid="ai-storyboard-shot-description"
                />
              </li>
            ))}
          </ul>

          <div className="flex flex-wrap items-center gap-2">
            <button className={btn} disabled={anyBusy} onClick={addShot} data-testid="ai-storyboard-add-shot">
              <PlusIcon className="mr-1 inline h-4 w-4" />
              Add frame
            </button>
            <button
              className={primary}
              disabled={anyBusy || !ai.available || shots.every(s => s.status === "done" || s.description.trim().length < 3)}
              onClick={() => void generateAll()}
              data-testid="ai-storyboard-generate-all"
            >
              {generatingAll ? "Generating…" : doneCount > 0 ? "Generate remaining" : "Generate all"}
            </button>
          </div>
        </div>
      )}

      {canView && (
        <p className="text-xs text-green-700" data-testid="ai-storyboard-done">
          {doneCount > 0 ? `Drew ${doneCount} frame${doneCount === 1 ? "" : "s"}. ` : ""}
          <button type="button" className="font-medium underline hover:text-green-900" data-testid="ai-storyboard-view" onClick={() => onView?.(sceneId!)}>
            View storyboard
          </button>
        </p>
      )}
      {error && <p role="alert" className="text-xs text-red-700" data-testid="ai-storyboard-error">{error}</p>}
      <AiNotices ai={ai} showCredits showTestBanner={false} />
    </section>
  );
}
