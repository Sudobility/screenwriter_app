import { useEffect, useState } from "react";
import { useScreenwriter } from "@sudobility/screenwriter_lib";
import type { CharacterImageResult, CharacterVisualState } from "@sudobility/screenwriter_types";
import { useAiActions } from "../hooks/useAiActions";
import { AiNotices } from "./AiNotices";

const empty: CharacterVisualState = { description: "", looksImageId: null, selectedLook: null, sheetImageId: null };
const button = "rounded border border-neutral-300 bg-white px-3 py-1.5 text-sm hover:bg-neutral-100 disabled:opacity-40";
const asAction = <T,>(result: T) => ({ result, usage: { credits: 0, promptTokens: 0, completionTokens: 0 } });

export function cropLooks(bitmap: ImageBitmap): string[] {
  const cellWidth = Math.floor(bitmap.width / 4);
  const cellHeight = Math.floor(bitmap.height / 4);
  const canvas = document.createElement("canvas");
  canvas.width = cellWidth;
  canvas.height = cellHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx || !cellWidth || !cellHeight) throw new Error("The generated image could not be sliced");
  return Array.from({ length: 16 }, (_, index) => {
    ctx.clearRect(0, 0, cellWidth, cellHeight);
    ctx.drawImage(bitmap, (index % 4) * cellWidth, Math.floor(index / 4) * cellHeight, cellWidth, cellHeight, 0, 0, cellWidth, cellHeight);
    return canvas.toDataURL("image/png");
  });
}

export function CharacterSheetSection({ documentId, characterId, value, onChange }: {
  documentId: string;
  characterId: string;
  value: CharacterVisualState | null;
  onChange(value: CharacterVisualState): void;
}) {
  const sw = useScreenwriter();
  const ai = useAiActions();
  const state = value ?? empty;
  const [description, setDescription] = useState(state.description);
  const [tiles, setTiles] = useState<string[]>([]);
  const [sheetUrl, setSheetUrl] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => { setDescription(state.description); }, [characterId]);
  useEffect(() => {
    if (!state.looksImageId) { setTiles([]); return; }
    setTiles([]);
    let active = true;
    void sw.createCharacterImages(documentId, characterId).image("looks", state.looksImageId)
      .then(bytes => createImageBitmap(new Blob([new Uint8Array(bytes)], { type: "image/png" })))
      .then(bitmap => { if (active) setTiles(cropLooks(bitmap)); bitmap.close(); })
      .catch(() => { if (active) setLoadError("Could not load the alternatives."); });
    return () => { active = false; };
  }, [sw, documentId, characterId, state.looksImageId]);
  useEffect(() => {
    if (!state.sheetImageId) { setSheetUrl(null); return; }
    let active = true;
    let url: string | null = null;
    void sw.createCharacterImages(documentId, characterId).image("sheet", state.sheetImageId)
      .then(bytes => { url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: "image/png" })); if (active) setSheetUrl(url); else URL.revokeObjectURL(url); })
      .catch(() => { if (active) setLoadError("Could not load the character sheet."); });
    return () => { active = false; if (url) URL.revokeObjectURL(url); };
  }, [sw, documentId, characterId, state.sheetImageId]);

  const generateLooks = async () => {
    const text = description.trim();
    if (text.length < 3) return;
    setLoadError(null);
    const result = await ai.run(client => client.generateCharacterLooks(documentId, characterId, { description: text }).then(asAction<CharacterImageResult>));
    if (result) onChange({ description: text, looksImageId: result.result.id, selectedLook: null, sheetImageId: null });
  };
  const generateSheet = async () => {
    if (state.selectedLook === null || !tiles[state.selectedLook]) return;
    setLoadError(null);
    const result = await ai.run(client => client.generateCharacterSheet(documentId, characterId, {
      description: state.description,
      selectedLook: state.selectedLook!,
      referenceImage: tiles[state.selectedLook!]!,
    }).then(asAction<CharacterImageResult>));
    if (result) onChange({ ...state, sheetImageId: result.result.id });
  };

  return <section className="space-y-3 rounded-lg border border-neutral-200 p-4" data-testid="character-sheet-section">
    <div><h3 className="font-semibold">AI character sheet</h3><p className="text-sm text-neutral-600">Describe the look, choose one of 16 alternatives, then generate eight views around the character.</p></div>
    <label className="block text-sm">Character appearance
      <textarea className="mt-1 w-full rounded border border-neutral-300 p-2" rows={3} value={description} onChange={e => setDescription(e.target.value)} placeholder="Appearance, clothing, age, mood, and other visual details" />
    </label>
    <button className={button} disabled={ai.busy || ai.mode !== "live" || description.trim().length < 3} onClick={() => void generateLooks()}>{ai.busy ? "Generating…" : state.looksImageId ? "Regenerate 16 looks" : "Generate 16 looks"}</button>
    {tiles.length === 16 && <div className="grid grid-cols-4 gap-2" role="group" aria-label="Character looks">
      {tiles.map((src, index) => <button key={index} type="button" className={`overflow-hidden rounded border-2 ${state.selectedLook === index ? "border-blue-600" : "border-transparent"}`} aria-label={`Choose look ${index + 1}`} aria-pressed={state.selectedLook === index} onClick={() => onChange({ ...state, selectedLook: index, sheetImageId: null })}><img src={src} alt={`Character look ${index + 1}`} className="w-full aspect-square object-cover" /></button>)}
    </div>}
    {state.selectedLook !== null && <button className={button} disabled={ai.busy || ai.mode !== "live" || !tiles[state.selectedLook]} onClick={() => void generateSheet()}>{ai.busy ? "Generating…" : "Generate eight-view sheet"}</button>}
    {ai.mode === "fixture" && <p className="text-xs text-neutral-600">Character images require a live image generation endpoint.</p>}
    {sheetUrl && <img src={sheetUrl} alt="Eight views around the selected character" className="w-full rounded border border-neutral-200" />}
    <AiNotices ai={ai} />
    {loadError && <p role="alert" className="text-sm text-red-600">{loadError}</p>}
  </section>;
}
