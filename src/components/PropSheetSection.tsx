import { useEffect, useState } from "react";
import { useScreenwriter } from "@sudobility/screenwriter_lib";
import type { PropImageResult, PropVisualState } from "@sudobility/screenwriter_types";
import { useAiActions } from "../hooks/useAiActions";
import { AiNotices } from "./AiNotices";
import { cropLooks } from "./CharacterSheetSection";

const empty: PropVisualState = { description: "", looksImageId: null, selectedLook: null, sheetImageId: null };
const button = "rounded border border-neutral-300 bg-white px-3 py-1.5 text-sm hover:bg-neutral-100 disabled:opacity-40";
const asAction = <T,>(result: T) => ({ result, usage: { credits: 0, promptTokens: 0, completionTokens: 0 } });

export function PropSheetSection({ documentId, propId, value, onChange }: {
  documentId: string;
  propId: string;
  value: PropVisualState | null;
  onChange(value: PropVisualState): void;
}) {
  const sw = useScreenwriter();
  const ai = useAiActions();
  const state = value ?? empty;
  const [description, setDescription] = useState(state.description);
  const [tiles, setTiles] = useState<string[]>([]);
  const [sheetUrl, setSheetUrl] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Reseed on entity switch and when the stored description changes (e.g. a Find & Replace), so an external edit
  // shows here and a later "Generate" cannot overwrite it with a stale value.
  useEffect(() => { setDescription(state.description); }, [propId, state.description]);
  useEffect(() => {
    if (!state.looksImageId) { setTiles([]); return; }
    setTiles([]);
    let active = true;
    void sw.createPropImages(documentId, propId).image("looks", state.looksImageId)
      .then(bytes => createImageBitmap(new Blob([new Uint8Array(bytes)], { type: "image/png" })))
      .then(bitmap => { if (active) setTiles(cropLooks(bitmap)); bitmap.close(); })
      .catch(() => { if (active) setLoadError("Could not load the alternatives."); });
    return () => { active = false; };
  }, [sw, documentId, propId, state.looksImageId]);
  useEffect(() => {
    if (!state.sheetImageId) { setSheetUrl(null); return; }
    let active = true;
    let url: string | null = null;
    void sw.createPropImages(documentId, propId).image("sheet", state.sheetImageId)
      .then(bytes => { url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: "image/png" })); if (active) setSheetUrl(url); else URL.revokeObjectURL(url); })
      .catch(() => { if (active) setLoadError("Could not load the prop sheet."); });
    return () => { active = false; if (url) URL.revokeObjectURL(url); };
  }, [sw, documentId, propId, state.sheetImageId]);

  const generateLooks = async () => {
    const text = description.trim();
    if (text.length < 3) return;
    setLoadError(null);
    const result = await ai.run(client => client.generatePropLooks(documentId, propId, { description: text }).then(asAction<PropImageResult>));
    if (result) onChange({ description: text, looksImageId: result.result.id, selectedLook: null, sheetImageId: null });
  };
  const generateSheet = async () => {
    if (state.selectedLook === null || !tiles[state.selectedLook]) return;
    setLoadError(null);
    const result = await ai.run(client => client.generatePropSheet(documentId, propId, {
      description: state.description,
      selectedLook: state.selectedLook!,
      referenceImage: tiles[state.selectedLook!]!,
    }).then(asAction<PropImageResult>));
    if (result) onChange({ ...state, sheetImageId: result.result.id });
  };

  return <section className="space-y-3 rounded-lg border border-neutral-200 p-4" data-testid="prop-sheet-section">
    <div><h3 className="font-semibold">AI prop sheet</h3><p className="text-sm text-neutral-600">Describe the look, choose one of 16 alternatives, then generate eight views around the prop.</p></div>
    <label className="block text-sm">Prop appearance
      <textarea data-testid="prop-appearance" className="mt-1 w-full rounded border border-neutral-300 p-2" rows={3} value={description} onChange={e => setDescription(e.target.value)} placeholder="Shape, material, color, wear, scale, and other visual details" />
    </label>
    <button className={button} disabled={ai.busy || ai.mode !== "live" || description.trim().length < 3} onClick={() => void generateLooks()}>{ai.busy ? "Generating…" : state.looksImageId ? "Regenerate 16 looks" : "Generate 16 looks"}</button>
    {tiles.length === 16 && <div className="grid grid-cols-4 gap-2" role="group" aria-label="Prop looks">
      {tiles.map((src, index) => <button key={index} type="button" className={`overflow-hidden rounded border-2 ${state.selectedLook === index ? "border-blue-600" : "border-transparent"}`} aria-label={`Choose look ${index + 1}`} aria-pressed={state.selectedLook === index} onClick={() => onChange({ ...state, selectedLook: index, sheetImageId: null })}><img src={src} alt={`Prop look ${index + 1}`} className="w-full aspect-square object-cover" /></button>)}
    </div>}
    {state.selectedLook !== null && <button className={button} disabled={ai.busy || ai.mode !== "live" || !tiles[state.selectedLook]} onClick={() => void generateSheet()}>{ai.busy ? "Generating…" : "Generate eight-view sheet"}</button>}
    {ai.mode === "fixture" && <p className="text-xs text-neutral-600">Prop images require a live image generation endpoint.</p>}
    {sheetUrl && <img src={sheetUrl} alt="Eight views around the selected prop" className="w-full rounded border border-neutral-200" />}
    <AiNotices ai={ai} />
    {loadError && <p role="alert" className="text-sm text-red-600">{loadError}</p>}
  </section>;
}
