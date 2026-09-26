import { useState } from "react";
import { skeletonForAi, mergeSkeleton, type Skeleton } from "../util/character-skeleton";
import { useAiActions } from "../hooks/useAiActions";
import { AiNotices } from "./AiNotices";
import { SKELETON_SECTIONS } from "../util/character-skeleton";

const btn = "border border-neutral-300 rounded px-2 py-1 text-sm bg-white hover:bg-neutral-100 disabled:opacity-40";
const label = (key: string) => Object.values(SKELETON_SECTIONS).flatMap(s => s.fields).find(f => f.key === key)?.label ?? key;

/**
 * "Generate from description" for a character skeleton: the writer pastes a free-form paragraph, the AI returns a
 * structured skeleton, and it is merged onto the skeleton being edited — filling blank fields only, so nothing the
 * writer already wrote is overwritten (`mergeSkeleton`). `existing` is the skeleton currently shown; `onApply`
 * receives the merged one.
 */
export function GenerateSkeletonBox({ existing, onApply }: { existing: Skeleton; onApply(merged: Skeleton): void }) {
  const ai = useAiActions();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [note, setNote] = useState<string | null>(null);

  const generate = async () => {
    setNote(null);
    const res = await ai.run(client => client.generateCharacterSkeleton({ text }));
    if (!res) return;
    const { skeleton, filled } = mergeSkeleton(existing, skeletonForAi(res.result.skeleton as Skeleton) as Skeleton);
    onApply(skeleton);
    setNote(
      filled.length === 0
        ? "Nothing new to fill in: every field the description covers already has a value."
        : `Filled in ${filled.length} field${filled.length === 1 ? "" : "s"}: ${filled.map(label).join(", ")}. Fields you had already filled in were kept.`
    );
    setText("");
  };

  if (!open) {
    return (
      <button className={btn} data-testid="ai-skeleton-toggle" onClick={() => setOpen(true)}>
        ✨ Generate from description
      </button>
    );
  }
  return (
    <div className="border border-neutral-200 rounded p-3 bg-neutral-50 space-y-2" data-testid="ai-skeleton-box">
      <label className="flex flex-col text-xs text-neutral-500">
        Describe the character in your own words
        <textarea
          spellCheck={true}
          autoCorrect="off"
          rows={4}
          data-testid="ai-skeleton-text"
          className="border border-neutral-300 rounded px-2 py-1 text-sm bg-white text-neutral-900"
          placeholder="e.g. Maya is a 47 year old trauma surgeon who hasn't slept properly in years..."
          value={text}
          onChange={e => setText(e.target.value)}
        />
      </label>
      <div className="flex gap-2 items-center">
        <button className={btn} data-testid="ai-skeleton-generate" disabled={ai.busy || !text.trim() || !ai.available} onClick={() => void generate()}>
          {ai.busy ? "Generating..." : "Generate skeleton"}
        </button>
        <button className={btn} disabled={ai.busy} onClick={() => setOpen(false)}>
          Close
        </button>
      </div>
      <AiNotices ai={ai} showCredits />
      {note && (
        <p role="status" data-testid="ai-skeleton-result" className="text-xs text-green-800">
          {note}
        </p>
      )}
    </div>
  );
}
