import { useEffect, useState } from "react";
import { useScreenwriter } from "@sudobility/screenwriter_lib";
import type { CharacterImageResult, CharacterVisualState } from "@sudobility/screenwriter_types";
import { useAiActions } from "../hooks/useAiActions";
import { AiNotices } from "./AiNotices";
import { ImageUploadButton } from "./ImageUploadButton";

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

export function CharacterSheetSection({ documentId, characterId, characterInfo, value, onChange }: {
  documentId: string;
  characterId: string;
  /** Everything else known about the character (name + skeleton), so looks can be generated without appearance notes. */
  characterInfo: string;
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

  // The full prompt sent to the image model: the character's name and skeleton, plus any free-text
  // appearance notes the writer typed. Capped to the API's 2000-character limit. Non-empty whenever the
  // character has a name or any skeleton field, so "Generate 16 looks" works without appearance notes.
  const composed = [characterInfo, description].map(s => s.trim()).filter(Boolean).join("\n\n").slice(0, 2000).trim();

  // Reseed from the model on entity switch and whenever the stored description changes (e.g. a Find & Replace),
  // so an external edit shows here and a later "Generate" cannot overwrite it with a stale value.
  useEffect(() => { setDescription(state.description); }, [characterId, state.description]);
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
    if (composed.length < 3) return;
    setLoadError(null);
    const result = await ai.run(client => client.generateCharacterLooks(documentId, characterId, { description: composed }).then(asAction<CharacterImageResult>));
    if (result) onChange({ description: description.trim(), looksImageId: result.result.id, selectedLook: null, sheetImageId: null });
  };
  const generateSheet = async () => {
    if (state.selectedLook === null || !tiles[state.selectedLook] || composed.length < 3) return;
    setLoadError(null);
    const result = await ai.run(client => client.generateCharacterSheet(documentId, characterId, {
      description: composed,
      selectedLook: state.selectedLook!,
      referenceImage: tiles[state.selectedLook!]!,
    }).then(asAction<CharacterImageResult>));
    if (result) onChange({ ...state, sheetImageId: result.result.id });
  };

  return <section className="space-y-3 rounded-lg border border-neutral-200 p-4" data-testid="character-sheet-section">
    <div><h3 className="font-semibold">AI character sheet</h3><p className="text-sm text-neutral-600">Generate 16 looks from the character sheet, choose one, then generate eight views around the character. Appearance notes below are optional — they refine the generated looks.</p></div>
    <label className="block text-sm">Character appearance (optional)
      <textarea data-testid="character-appearance" className="mt-1 w-full rounded border border-neutral-300 p-2" rows={3} value={description} onChange={e => setDescription(e.target.value)} placeholder="Extra visual details to refine the looks: clothing, mood, lighting, and so on" />
    </label>
    <div className="flex flex-wrap items-center gap-2">
      <button className={button} disabled={ai.busy || ai.mode !== "live" || composed.length < 3} onClick={() => void generateLooks()}>{ai.busy ? "Generating…" : state.looksImageId ? "Regenerate 16 looks" : "Generate 16 looks"}</button>
      <ImageUploadButton
        label={state.sheetImageId ? "Replace with an uploaded sheet" : "Upload a character sheet"}
        onUpload={async dataUrl => { const r = await sw.createCharacterImages(documentId, characterId).upload("sheet", dataUrl); onChange({ ...state, sheetImageId: r.id }); }}
      />
    </div>
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
