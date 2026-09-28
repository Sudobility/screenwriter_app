import type { SceneSummaryStatus } from "@sudobility/screenwriter_types";

/**
 * Whether one scene can be reviewed on its own. It can when every scene BEFORE it has a summary to stand in for it
 * (the AI is sent those summaries and the scene in full, nothing of what follows). The order of the scenes is the
 * document's as it is now in the editor; the summaries are what the server has. A scene the server does not know
 * yet (just written, not synced) has no summary.
 */
export interface SceneReviewCheck {
  allowed: boolean;
  /** The scenes before it, in order. */
  before: number;
  /** Those of them without a summary: what stands in the way. */
  missing: { sceneId: string; heading: string; position: number }[];
  /** Those whose summary was made before the scene last changed: usable, a complete review refreshes them. */
  outdated: number;
}

export function checkSceneReview(
  scenes: readonly { id: string; heading: string }[],
  sceneId: string | null | undefined,
  summaries: readonly SceneSummaryStatus[] | null
): SceneReviewCheck {
  const at = sceneId ? scenes.findIndex(s => s.id === sceneId) : -1;
  if (at < 0 || !summaries) return { allowed: false, before: Math.max(0, at), missing: [], outdated: 0 };
  const known = new Map(summaries.map(s => [s.sceneId, s]));
  const earlier = scenes.slice(0, at);
  const missing = earlier.flatMap((s, i) => (known.get(s.id)?.source ? [] : [{ sceneId: s.id, heading: s.heading, position: i + 1 }]));
  const outdated = earlier.filter(s => known.get(s.id)?.source && !known.get(s.id)!.current).length;
  return { allowed: missing.length === 0, before: earlier.length, missing, outdated };
}
