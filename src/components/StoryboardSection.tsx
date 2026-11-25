import { useState } from "react";
import { useScreenwriter } from "@sudobility/screenwriter_lib";
import type { ScriptEditorHost } from "@sudobility/writing_ui";
import { useModelTick } from "../util/use-model-tick";
import { useAiActions } from "../hooks/useAiActions";
import { applyStoryboard, getSceneStoryboard } from "../util/storyboards";
import { readScene } from "../util/ai-script";
import { AiNotices } from "./AiNotices";
import { primary } from "./ai/shared";

/**
 * The AI "Generate storyboard" options screen: turn the current scene into a line-art storyboard (title, description,
 * 1..N frames), with optional writer instructions. If the scene already has a storyboard, the button replaces it.
 */
export function StoryboardSection({ host, documentId, scene }: {
  host: ScriptEditorHost;
  documentId: string;
  scene: { id: string; heading: string } | null;
}) {
  useModelTick(host);
  const sw = useScreenwriter();
  const ai = useAiActions();
  const [instructions, setInstructions] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const existing = scene ? getSceneStoryboard(host, scene.id) : null;

  const run = async () => {
    if (!scene) return;
    const read = readScene(host, scene.id);
    if (!read || read.elements.length === 0) return;
    setDone(null);
    setBusy(true);
    try {
      const trimmed = instructions.trim() || undefined;
      const res = await ai.run(client =>
        client.storyboardFromScene({ scene: { heading: read.heading || undefined, elements: read.elements }, ...(trimmed ? { instructions: trimmed } : {}) }),
      );
      if (!res) return; // consent needed, or an error already surfaced by AiNotices
      const storyboard = await applyStoryboard(sw, host, documentId, scene.id, res.result, instructions);
      setDone(storyboard.shortTitle);
      setInstructions("");
    } finally {
      setBusy(false);
    }
  };

  const working = busy || ai.busy;
  return (
    <section className="space-y-2" data-testid="ai-storyboard-section">
      <h3 className="text-xs font-semibold uppercase text-neutral-500">Generate storyboard</h3>
      <p className="text-xs text-neutral-600">Turn the current scene into a line-art storyboard: a title, a description and one or more frames.</p>
      <p className="text-sm" data-testid="ai-storyboard-scope">
        Scene: {scene ? <strong>{scene.heading || "(untitled scene)"}</strong> : <span className="text-neutral-500">(click in the script to choose a scene)</span>}
      </p>
      <label className="flex flex-col gap-1 text-xs text-neutral-500">
        Additional instructions (optional)
        <textarea
          className="rounded border border-neutral-300 p-2 text-sm text-neutral-800"
          rows={2}
          value={instructions}
          onChange={e => setInstructions(e.target.value)}
          placeholder="Camera notes, mood, what to emphasise…"
          data-testid="ai-storyboard-instructions"
        />
      </label>
      {existing && (
        <p className="text-xs text-amber-700" data-testid="ai-storyboard-replace-note">
          This scene already has a storyboard — generating replaces it.
        </p>
      )}
      <button className={primary} disabled={working || !scene || !ai.available} onClick={() => void run()} data-testid="ai-storyboard-button">
        {working ? "Generating…" : existing ? "Replace storyboard" : "Generate storyboard"}
      </button>
      {done && (
        <p className="text-xs text-green-700" data-testid="ai-storyboard-done">
          Storyboard created: “{done}”. Open the Storyboards panel to view it.
        </p>
      )}
      <AiNotices ai={ai} showCredits showTestBanner={false} />
    </section>
  );
}
