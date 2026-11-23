import { useMemo, useState } from "react";
import type { ScriptEditorHost } from "@sudobility/writing_ui";
import type { TensionCurveResult } from "@sudobility/screenwriter_types";
import { useAiActions } from "../hooks/useAiActions";
import { AiNotices } from "./AiNotices";

const primary = "bg-neutral-900 text-white rounded px-3 py-1 text-sm hover:bg-neutral-800 disabled:opacity-50";

const MAX_SCENES = 160;
const SCENE_TEXT_MAX = 1_200;

type SceneInput = { id: string; heading: string; text: string };

/** Each scene as {id, heading, text} for the tension pass; body is the scene's element text (not the heading), capped. */
function sceneInputs(host: ScriptEditorHost): SceneInput[] {
  return host.model
    .scenes()
    .map(s => {
      const parts: string[] = [];
      for (const id of s.elementIds) {
        if (id === s.id) continue;
        const t = host.model.element(id)?.text.plain.trim();
        if (t) parts.push(t);
      }
      return { id: String(s.id), heading: s.headingText || "", text: parts.join(" ").slice(0, SCENE_TEXT_MAX) };
    })
    .filter(s => s.heading || s.text)
    .slice(0, MAX_SCENES);
}

const W = 320;
const H = 120;
const PAD = { top: 10, right: 8, bottom: 8, left: 8 };

/**
 * The script's dramatic tension as a curve: a per-scene intensity (1-5) scored by AI, plotted in scene order.
 * Low points (≤2) are marked; clicking a point jumps to that scene. Nothing is written into the document.
 */
export function TensionCurveSection({ host, onJumpTo }: { host: ScriptEditorHost; onJumpTo(sceneId: string): void }) {
  const ai = useAiActions();
  const [result, setResult] = useState<TensionCurveResult | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const scenes = host.model.scenes();
  const headingOf = useMemo(() => new Map(scenes.map(s => [String(s.id), s.headingText || "Untitled scene"])), [scenes]);

  const run = async () => {
    setMessage(null);
    const inputs = sceneInputs(host);
    if (inputs.length === 0) {
      setMessage("Add some scenes first.");
      return;
    }
    const res = await ai.run(client => client.tensionCurve({ scenes: inputs }));
    if (res) {
      setResult(res.result);
      if (res.result.scenes.length === 0) setMessage("The AI returned no scores.");
    }
  };

  // Plot in script order, keeping only scenes that got a score.
  const points = useMemo(() => {
    if (!result) return [];
    const byId = new Map(result.scenes.map(s => [s.sceneId, s]));
    const ordered = scenes.map(s => ({ sceneId: String(s.id), scored: byId.get(String(s.id)) })).filter(p => p.scored);
    const n = ordered.length;
    const innerW = W - PAD.left - PAD.right;
    const innerH = H - PAD.top - PAD.bottom;
    return ordered.map((p, i) => ({
      sceneId: p.sceneId,
      intensity: p.scored!.intensity,
      note: p.scored!.note,
      x: PAD.left + (n <= 1 ? innerW / 2 : (i * innerW) / (n - 1)),
      y: PAD.top + ((5 - p.scored!.intensity) / 4) * innerH,
    }));
  }, [result, scenes]);

  const sags = points.filter(p => p.intensity <= 2);

  return (
    <section className="space-y-2" data-testid="ai-tension-section">
      <h3 className="text-xs font-semibold uppercase text-neutral-500">Tension curve</h3>
      <p className="text-xs text-neutral-600">A per-scene dramatic-intensity graph. Click a point to jump to that scene.</p>
      <button className={primary} data-testid="ai-tension-button" disabled={ai.busy || !ai.available} onClick={() => void run()}>
        {ai.busy ? "Scoring scenes…" : result ? "Rescore" : "Plot tension curve"}
      </button>
      <AiNotices ai={ai} showTestBanner={false} />
      {message && <p role="status" className="text-xs text-neutral-700">{message}</p>}
      {points.length > 0 && (
        <div className="space-y-2 rounded border border-neutral-200 bg-white p-2" data-testid="ai-tension-result">
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Tension curve">
            {[1, 2, 3, 4, 5].map(lvl => {
              const y = PAD.top + ((5 - lvl) / 4) * (H - PAD.top - PAD.bottom);
              return <line key={lvl} x1={PAD.left} y1={y} x2={W - PAD.right} y2={y} stroke="#eee" strokeWidth={1} />;
            })}
            <polyline fill="none" stroke="#6366f1" strokeWidth={1.5} points={points.map(p => `${p.x},${p.y}`).join(" ")} />
            {points.map(p => (
              <circle
                key={p.sceneId}
                data-testid="ai-tension-point"
                data-scene-id={p.sceneId}
                data-intensity={p.intensity}
                cx={p.x}
                cy={p.y}
                r={3.5}
                className="cursor-pointer"
                fill={p.intensity <= 2 ? "#ef4444" : "#6366f1"}
                onClick={() => onJumpTo(p.sceneId)}
              >
                <title>{`${headingOf.get(p.sceneId) ?? ""} — intensity ${p.intensity}${p.note ? `: ${p.note}` : ""}`}</title>
              </circle>
            ))}
          </svg>
          {sags.length > 0 && (
            <div className="text-[11px] text-neutral-700">
              <p className="font-medium">Low-tension scenes:</p>
              <ul className="space-y-0.5">
                {sags.map(p => (
                  <li key={p.sceneId}>
                    <button type="button" className="text-left underline" data-testid="ai-tension-sag" onClick={() => onJumpTo(p.sceneId)}>
                      {headingOf.get(p.sceneId)} ({p.intensity})
                    </button>
                    {p.note ? ` — ${p.note}` : ""}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
