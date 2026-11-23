import { useMemo, useState } from "react";
import type { ScriptEditorHost } from "@sudobility/writing_ui";
import type { BreakdownCategory, ScriptBreakdownResult } from "@sudobility/screenwriter_types";
import { useAiActions } from "../hooks/useAiActions";
import { AiNotices } from "./AiNotices";

const primary = "bg-neutral-900 text-white rounded px-3 py-1 text-sm hover:bg-neutral-800 disabled:opacity-50";
const btn = "border border-neutral-300 rounded px-2 py-1 text-xs hover:bg-neutral-100 disabled:opacity-50";

const MAX_SCENES = 160;
const SCENE_TEXT_MAX = 2_000;

const LABEL: Record<BreakdownCategory, string> = {
  cast: "Cast",
  extras: "Extras",
  stunts: "Stunts",
  props: "Props",
  wardrobe: "Wardrobe",
  makeupHair: "Makeup/Hair",
  setDressing: "Set dressing",
  vehicles: "Vehicles",
  animals: "Animals",
  sfx: "SFX",
  vfx: "VFX",
  sound: "Sound",
  special: "Special",
};

function sceneInputs(host: ScriptEditorHost) {
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

/**
 * An AD-style production breakdown: each scene's cast, props, wardrobe, VFX, stunts, etc., grouped by category.
 * Read-only — copy or export it; nothing is written into the document's catalog (adding elements as tags/entities
 * is a deliberate follow-on so the catalog is not polluted with AI guesses).
 */
export function ScriptBreakdownSection({ host, onJumpTo }: { host: ScriptEditorHost; onJumpTo(sceneId: string): void }) {
  const ai = useAiActions();
  const [result, setResult] = useState<ScriptBreakdownResult | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const scenes = host.model.scenes();
  const headingOf = useMemo(() => new Map(scenes.map(s => [String(s.id), s.headingText || "Untitled scene"])), [scenes]);

  // Show scenes in script order, keeping only those with a breakdown.
  const ordered = useMemo(() => {
    if (!result) return [];
    const byId = new Map(result.scenes.map(s => [s.sceneId, s]));
    return scenes.map(s => byId.get(String(s.id))).filter((s): s is ScriptBreakdownResult["scenes"][number] => !!s && s.elements.length > 0);
  }, [result, scenes]);

  const run = async () => {
    setMessage(null);
    const inputs = sceneInputs(host);
    if (inputs.length === 0) {
      setMessage("Add some scenes first.");
      return;
    }
    const res = await ai.run(client => client.scriptBreakdown({ scenes: inputs }));
    if (res) {
      setResult(res.result);
      if (res.result.scenes.length === 0) setMessage("No production elements were found.");
    }
  };

  const exportText = () =>
    ordered
      .map(s => `${headingOf.get(s.sceneId) ?? s.sceneId}\n` + s.elements.map(e => `  ${LABEL[e.category]}: ${e.items.join(", ")}`).join("\n"))
      .join("\n\n");
  const copyAll = () => void navigator.clipboard?.writeText(exportText()).catch(() => undefined);

  return (
    <section className="space-y-2" data-testid="ai-breakdown-section">
      <h3 className="text-xs font-semibold uppercase text-neutral-500">Script breakdown</h3>
      <p className="text-xs text-neutral-600">A production breakdown — cast, props, wardrobe, VFX, stunts and more — scene by scene.</p>
      <button className={primary} data-testid="ai-breakdown-button" disabled={ai.busy || !ai.available} onClick={() => void run()}>
        {ai.busy ? "Breaking down…" : result ? "Re-run breakdown" : "Break down the script"}
      </button>
      <AiNotices ai={ai} showTestBanner={false} />
      {message && <p role="status" className="text-xs text-neutral-700">{message}</p>}
      {ordered.length > 0 && (
        <div className="space-y-2 rounded border border-neutral-200 bg-white p-2 text-xs" data-testid="ai-breakdown-result">
          <button type="button" className={btn} data-testid="ai-breakdown-copy" onClick={copyAll}>Copy breakdown</button>
          {ordered.map(s => (
            <div key={s.sceneId} data-testid="ai-breakdown-scene" data-scene-id={s.sceneId} className="border-t border-neutral-100 pt-1">
              <button type="button" className="font-medium text-left hover:underline" onClick={() => onJumpTo(s.sceneId)}>
                {headingOf.get(s.sceneId)}
              </button>
              <dl className="mt-0.5 space-y-0.5">
                {s.elements.map(e => (
                  <div key={e.category} className="flex gap-1" data-testid="ai-breakdown-category" data-category={e.category}>
                    <dt className="shrink-0 text-[10px] font-semibold uppercase text-neutral-500 w-20">{LABEL[e.category]}</dt>
                    <dd className="flex flex-wrap gap-1">
                      {e.items.map((it, i) => (
                        <span key={i} className="rounded bg-neutral-100 px-1.5 py-0.5">{it}</span>
                      ))}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
