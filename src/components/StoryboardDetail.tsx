import { useEffect, useState } from "react";
import { useScreenwriter } from "@sudobility/screenwriter_lib";
import type { ScriptEditorHost } from "@sudobility/writing_ui";
import { useModelTick } from "../util/use-model-tick";
import { deleteSceneStoryboard, getSceneStoryboard } from "../util/storyboards";

/**
 * One scene's AI storyboard: the short title, the detailed description and the line-art frames, with a Delete CTA.
 * Storyboards are generated from the script (the AI "Generate storyboard" action or the script toolbar), never
 * authored here; this view only shows and removes them.
 */
export function StoryboardDetail({ host, documentId, sceneId, onDeleted }: {
  host: ScriptEditorHost;
  documentId: string;
  projectId: string;
  sceneId: string;
  onDeleted?(): void;
}) {
  useModelTick(host);
  const sw = useScreenwriter();
  const scene = host.model.scenes().find(item => String(item.id) === sceneId);
  const storyboard = getSceneStoryboard(host, sceneId);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
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

  const remove = async () => {
    setBusy(true);
    setError("");
    try {
      const flow = sw.createProductionImages(documentId, "storyboard", sceneId);
      await Promise.all(storyboard.images.map(image => flow.delete(image.id).catch(() => undefined)));
      deleteSceneStoryboard(host, sceneId);
      onDeleted?.();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not delete the storyboard.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto p-6" data-testid="storyboard-detail" data-scene-id={sceneId}>
      <div className="mx-auto max-w-5xl space-y-4">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-xl font-semibold" data-testid="storyboard-title">{storyboard.shortTitle}</h2>
            <p className="text-sm text-neutral-500">{scene.headingText || "Untitled scene"}</p>
          </div>
          <button
            type="button"
            data-testid="storyboard-delete"
            disabled={busy}
            onClick={() => void remove()}
            className="shrink-0 rounded border border-red-300 px-3 py-1.5 text-sm text-red-700 hover:bg-red-50 disabled:opacity-40"
          >
            Delete
          </button>
        </div>
        <p className="whitespace-pre-wrap text-sm text-neutral-800" data-testid="storyboard-description">{storyboard.detailedDescription}</p>
        {storyboard.images.length === 0 ? (
          <p className="text-sm text-neutral-500">No frames were drawn for this storyboard.</p>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {storyboard.images.map(image => (
              <figure key={image.id} className="rounded border border-neutral-200 p-2" data-testid="storyboard-frame">
                {urls[image.id] ? (
                  <img src={urls[image.id]} alt={image.description} className="w-full rounded bg-white" />
                ) : (
                  <div className="flex aspect-video items-center justify-center rounded bg-neutral-50 text-xs text-neutral-400">Loading…</div>
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
