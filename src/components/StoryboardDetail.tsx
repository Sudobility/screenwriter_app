import { useEffect, useState } from "react";
import { TrashIcon } from "@heroicons/react/24/outline";
import { useScreenwriter } from "@sudobility/screenwriter_lib";
import type { ScriptEditorHost } from "@sudobility/writing_ui";
import { useModelTick } from "../util/use-model-tick";
import { deleteStoryboardImage, getSceneStoryboard, removeStoryboard } from "../util/storyboards";

/**
 * One scene's AI storyboard: the short title, the detailed description and the line-art frames, with a Delete CTA.
 * Storyboards are generated from the script (the AI "Generate storyboard" action or the script toolbar), never
 * authored here; this view only shows and removes them.
 */
export function StoryboardDetail({ host, documentId, sceneId, onDeleted, onJumpTo }: {
  host: ScriptEditorHost;
  documentId: string;
  projectId: string;
  sceneId: string;
  onDeleted?(): void;
  /** Jump to this storyboard's scene in the script editor. */
  onJumpTo?(sceneId: string): void;
}) {
  useModelTick(host);
  const sw = useScreenwriter();
  const scene = host.model.scenes().find(item => String(item.id) === sceneId);
  const storyboard = getSceneStoryboard(host, sceneId);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  /** The image id currently being deleted (so just its frame shows a pending state), or "all" while deleting all. */
  const [deleting, setDeleting] = useState<string | null>(null);
  const [error, setError] = useState("");

  const imageIds = (storyboard?.images ?? []).map(image => image.id).join(",");
  useEffect(() => {
    let active = true;
    const made: string[] = [];
    const load = async () => {
      const flow = sw.createProductionImages(documentId, "storyboard", sceneId);
      const entries = await Promise.all(
        (storyboard?.images ?? []).map(async image => {
          const bytes = await flow.image(image.id).catch(() => null);
          if (!bytes) return null;
          const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: "image/png" }));
          made.push(url);
          return [image.id, url] as const;
        }),
      );
      if (active) setUrls(Object.fromEntries(entries.filter((e): e is readonly [string, string] => !!e)));
      else made.forEach(URL.revokeObjectURL);
    };
    void load().catch(() => undefined);
    return () => {
      active = false;
      made.forEach(URL.revokeObjectURL);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sw, documentId, sceneId, imageIds]);

  if (!scene) return <div className="p-6">Scene no longer exists.</div>;
  if (!storyboard) {
    return (
      <div className="h-full overflow-y-auto p-6" data-testid="storyboard-detail">
        <h2 className="text-xl font-semibold">{scene.headingText || "Untitled scene"}</h2>
        <p className="mt-2 text-sm text-neutral-600">No storyboard for this scene yet. Generate one from the AI panel or the script toolbar.</p>
      </div>
    );
  }

  const removeAll = async () => {
    setBusy(true);
    setDeleting("all");
    setError("");
    try {
      await removeStoryboard(sw, host, documentId, sceneId);
      onDeleted?.();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not delete the storyboard.");
    } finally {
      setBusy(false);
      setDeleting(null);
    }
  };

  const removeOne = async (imageId: string) => {
    setDeleting(imageId);
    setError("");
    try {
      await deleteStoryboardImage(sw, host, documentId, sceneId, imageId);
      // That was the last frame: the storyboard is gone, so let the pane fall back to the list.
      if (!getSceneStoryboard(host, sceneId)) onDeleted?.();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not delete that frame.");
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div className="h-full overflow-y-auto p-6" data-testid="storyboard-detail" data-scene-id={sceneId}>
      <div className="mx-auto max-w-5xl space-y-4">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-xl font-semibold" data-testid="storyboard-title">{storyboard.shortTitle}</h2>
            {onJumpTo ? (
              <button
                type="button"
                className="text-sm text-neutral-500 underline hover:text-neutral-800"
                data-testid="storyboard-goto-scene"
                title="Go to this scene in the script"
                onClick={() => onJumpTo(sceneId)}
              >
                {scene.headingText || "Untitled scene"}
              </button>
            ) : (
              <p className="text-sm text-neutral-500">{scene.headingText || "Untitled scene"}</p>
            )}
          </div>
          <button
            type="button"
            data-testid="storyboard-delete-all"
            disabled={busy || !!deleting}
            onClick={() => void removeAll()}
            className="shrink-0 rounded border border-red-300 px-3 py-1.5 text-sm text-red-700 hover:bg-red-50 disabled:opacity-40"
          >
            {deleting === "all" ? "Deleting…" : "Delete all"}
          </button>
        </div>
        <p className="whitespace-pre-wrap text-sm text-neutral-800" data-testid="storyboard-description">{storyboard.detailedDescription}</p>
        {storyboard.images.length === 0 ? (
          <p className="text-sm text-neutral-500">No frames were drawn for this storyboard.</p>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {storyboard.images.map(image => (
              <figure key={image.id} className="relative rounded border border-neutral-200 p-2" data-testid="storyboard-frame" data-image-id={image.id}>
                <button
                  type="button"
                  className="absolute right-3 top-3 z-10 rounded-full border border-neutral-300 bg-white/90 p-1 text-neutral-500 shadow-sm hover:text-red-600 disabled:opacity-40"
                  title="Delete this frame"
                  aria-label="Delete this frame"
                  data-testid="storyboard-frame-delete"
                  disabled={busy || !!deleting}
                  onClick={() => void removeOne(image.id)}
                >
                  <TrashIcon className="h-4 w-4" />
                </button>
                {urls[image.id] ? (
                  <img src={urls[image.id]} alt={image.description} className={`w-full rounded bg-white ${deleting === image.id ? "opacity-40" : ""}`} />
                ) : (
                  <div className="flex aspect-video items-center justify-center rounded bg-neutral-50 text-xs text-neutral-400">
                    {deleting === image.id ? "Deleting…" : "Loading…"}
                  </div>
                )}
                <figcaption className="mt-2 text-xs text-neutral-600">{image.description}</figcaption>
              </figure>
            ))}
          </div>
        )}
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      </div>
    </div>
  );
}
