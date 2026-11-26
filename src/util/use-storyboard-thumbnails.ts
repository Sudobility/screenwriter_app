import { useEffect, useReducer, useState } from "react";
import { useScreenwriter } from "@sudobility/screenwriter_lib";
import type { ScriptEditorHost } from "@sudobility/writing_ui";
import { getSceneStoryboards } from "./storyboards";

/**
 * Blob-URL thumbnails (the first drawn frame) for every scene that has a storyboard, keyed by sceneId — which is the
 * scene heading's element id, so the script editor's `SceneThumbnailGutter` can anchor a marker to the heading. The
 * URLs are created from object storage and revoked when they change or the component unmounts. Recomputes when the
 * document model changes (a storyboard added, replaced or deleted).
 */
export function useStoryboardThumbnails(
  host: ScriptEditorHost | null,
  documentId: string,
): ReadonlyMap<string, { src: string }> {
  const sw = useScreenwriter();
  const [, bump] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    if (!host) return;
    return host.subscribe(() => bump());
  }, [host]);

  // scene heading id → first frame's image id, recomputed each render (so a model change refreshes it). Stringified
  // into a stable key so the fetch effect only re-runs when the actual (scene, frame) set changes.
  const pairs = host
    ? Object.entries(getSceneStoryboards(host))
        .map(([sceneId, sb]) => [sceneId, sb.images[0]?.id] as const)
        .filter((p): p is readonly [string, string] => !!p[1])
    : [];
  const key = pairs.map(([s, i]) => `${s}:${i}`).join(",");

  const [urls, setUrls] = useState<ReadonlyMap<string, { src: string }>>(new Map());
  useEffect(() => {
    if (!host || pairs.length === 0) {
      setUrls(new Map());
      return;
    }
    let active = true;
    const made: string[] = [];
    void (async () => {
      const entries = await Promise.all(
        pairs.map(async ([sceneId, imageId]) => {
          const flow = sw.createProductionImages(documentId, "storyboard", sceneId);
          const bytes = await flow.image(imageId).catch(() => null);
          if (!bytes) return null;
          const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: "image/png" }));
          made.push(url);
          return [sceneId, { src: url }] as const;
        }),
      );
      if (!active) {
        made.forEach(URL.revokeObjectURL);
        return;
      }
      setUrls(new Map(entries.filter((e): e is readonly [string, { src: string }] => !!e)));
    })();
    return () => {
      active = false;
      made.forEach(URL.revokeObjectURL);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sw, documentId, host, key]);

  return urls;
}
