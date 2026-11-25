import { useState } from "react";
import { Squares2X2Icon } from "@heroicons/react/24/outline";
import { FormModal } from "@sudobility/components";
import { useScreenwriter } from "@sudobility/screenwriter_lib";
import { useEditorSelection, type ScriptEditorHost } from "@sudobility/writing_ui";
import { useModelTick } from "../util/use-model-tick";
import { useAiActions } from "../hooks/useAiActions";
import { applyStoryboard, getSceneStoryboard } from "../util/storyboards";
import { readScene } from "../util/ai-script";
import { AiNotices } from "./AiNotices";
import { IconButton } from "./shell/IconButton";

/**
 * Script-toolbar action: generate a line-art storyboard for the scene at the caret. Opens a small dialog for optional
 * instructions; if the scene already has a storyboard, it says so and the action replaces it (an explicit confirm).
 */
export function GenerateStoryboardButton({ host, documentId, onGenerated }: {
  host: ScriptEditorHost;
  documentId: string;
  onGenerated?(sceneId: string): void;
}) {
  useModelTick(host);
  const sw = useScreenwriter();
  const ai = useAiActions();
  const selection = useEditorSelection(host);
  const scene = selection?.head.elementId ? host.model.sceneOf(selection.head.elementId as never) : null;
  const sceneId = scene ? String(scene.id) : null;
  const [open, setOpen] = useState(false);
  const [instructions, setInstructions] = useState("");
  const [busy, setBusy] = useState(false);
  const existing = sceneId ? getSceneStoryboard(host, sceneId) : null;

  const run = async () => {
    if (!sceneId) return;
    const read = readScene(host, sceneId);
    if (!read || read.elements.length === 0) return;
    setBusy(true);
    try {
      const trimmed = instructions.trim() || undefined;
      const res = await ai.run(client =>
        client.storyboardFromScene({ scene: { heading: read.heading || undefined, elements: read.elements }, ...(trimmed ? { instructions: trimmed } : {}) }),
      );
      if (!res) return; // consent needed, or an error surfaced by AiNotices
      await applyStoryboard(sw, host, documentId, sceneId, res.result, instructions);
      setOpen(false);
      setInstructions("");
      onGenerated?.(sceneId);
    } finally {
      setBusy(false);
    }
  };

  const working = busy || ai.busy;
  return (
    <>
      <IconButton
        icon={Squares2X2Icon}
        label="Generate storyboard for this scene"
        disabled={!sceneId}
        testId="generate-storyboard"
        onMouseDown={e => e.preventDefault()}
        onClick={() => setOpen(true)}
      />
      <FormModal open={open} title="Generate storyboard" onClose={() => !working && setOpen(false)} actions={[]}>
        <div className="space-y-3">
          <p className="text-sm">
            Scene: <strong>{scene?.headingText || "(untitled scene)"}</strong>
          </p>
          <label className="block text-sm">
            Additional instructions (optional)
            <textarea
              className="mt-1 block w-full rounded border border-neutral-300 p-2 text-sm"
              rows={3}
              value={instructions}
              onChange={e => setInstructions(e.target.value)}
              placeholder="Camera notes, mood, what to emphasise…"
              data-testid="generate-storyboard-instructions"
            />
          </label>
          {existing && (
            <p className="text-sm text-amber-700" data-testid="generate-storyboard-replace">
              This scene already has a storyboard. Generating will replace it.
            </p>
          )}
          <div className="flex justify-end">
            <button
              type="button"
              className="rounded bg-neutral-900 px-3 py-1.5 text-sm text-white disabled:opacity-50"
              disabled={working || !sceneId || !ai.available}
              onClick={() => void run()}
              data-testid="generate-storyboard-run"
            >
              {working ? "Generating…" : existing ? "Replace storyboard" : "Generate storyboard"}
            </button>
          </div>
          <AiNotices ai={ai} showTestBanner={false} />
        </div>
      </FormModal>
    </>
  );
}
