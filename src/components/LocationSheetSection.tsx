import { useEffect, useState } from "react";
import { useScreenwriter } from "@sudobility/screenwriter_lib";
import { LOCATION_IMAGE_TIMES, type LocationImageTime, type LocationLooksResult, type LocationTimesResult, type LocationVisualState } from "@sudobility/screenwriter_types";
import { useAiActions } from "../hooks/useAiActions";
import { AiNotices } from "./AiNotices";
import { cropLooks } from "./CharacterSheetSection";

const empty: LocationVisualState = { description: "", looksImageId: null, selectedLook: null, timeImageIds: {} };
const button = "rounded border border-neutral-300 bg-white px-3 py-1.5 text-sm hover:bg-neutral-100 disabled:opacity-40";
const asAction = <T,>(result: T) => ({ result, usage: { credits: 0, promptTokens: 0, completionTokens: 0 } });

export function LocationSheetSection({ documentId, locationId, locationName, value, onChange }: {
  documentId: string;
  locationId: string;
  locationName: string;
  value: LocationVisualState | null;
  onChange(value: LocationVisualState): void;
}) {
  const sw = useScreenwriter();
  const ai = useAiActions();
  const state = value ?? empty;
  const [description, setDescription] = useState(state.description);
  const [tiles, setTiles] = useState<string[]>([]);
  const [timeUrls, setTimeUrls] = useState<Partial<Record<LocationImageTime, string>>>({});
  const [loadError, setLoadError] = useState<string | null>(null);
  const timeIds = LOCATION_IMAGE_TIMES.map(time => state.timeImageIds?.[time] ?? "").join("|");

  useEffect(() => { setDescription(state.description); }, [locationId]);
  useEffect(() => {
    if (!state.looksImageId) { setTiles([]); return; }
    setTiles([]);
    let active = true;
    void sw.createLocationImages(documentId, locationId).image("looks", state.looksImageId)
      .then(bytes => createImageBitmap(new Blob([new Uint8Array(bytes)], { type: "image/png" })))
      .then(bitmap => { if (active) setTiles(cropLooks(bitmap)); bitmap.close(); })
      .catch(() => { if (active) setLoadError("Could not load the location alternatives."); });
    return () => { active = false; };
  }, [sw, documentId, locationId, state.looksImageId]);
  useEffect(() => {
    const ids = state.timeImageIds ?? {};
    let active = true;
    const urls: string[] = [];
    setTimeUrls({});
    void Promise.all(LOCATION_IMAGE_TIMES.map(async time => {
      const id = ids[time];
      if (!id) return null;
      const bytes = await sw.createLocationImages(documentId, locationId).image(time, id);
      const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: "image/png" }));
      urls.push(url);
      return { time, url };
    })).then(images => {
      if (!active) return;
      setTimeUrls(Object.fromEntries(images.filter((image): image is { time: LocationImageTime; url: string } => image !== null).map(image => [image.time, image.url])));
    }).catch(() => { if (active) setLoadError("Could not load the location images."); });
    return () => { active = false; urls.forEach(url => URL.revokeObjectURL(url)); };
  }, [sw, documentId, locationId, timeIds]);

  const generateLooks = async () => {
    const text = description.trim();
    if (text.length < 3) return;
    setLoadError(null);
    const result = await ai.run(client => client.generateLocationLooks(documentId, locationId, { description: text }).then(asAction<LocationLooksResult>));
    if (result) onChange({ description: text, looksImageId: result.result.id, selectedLook: null, timeImageIds: {} });
  };
  const generateTimes = async () => {
    if (state.selectedLook === null || !tiles[state.selectedLook]) return;
    setLoadError(null);
    const result = await ai.run(client => client.generateLocationTimes(documentId, locationId, {
      description: state.description,
      selectedLook: state.selectedLook!,
      referenceImage: tiles[state.selectedLook!]!,
    }).then(asAction<LocationTimesResult>));
    if (result) onChange({ ...state, timeImageIds: result.result.images });
  };

  return <section className="space-y-3 rounded-lg border border-neutral-200 p-4" data-testid="location-sheet-section">
    <div><h3 className="font-semibold">AI location sheet</h3><p className="text-sm text-neutral-600">Choose one of 16 location designs, then generate separate images for morning, noon, afternoon, and night.</p></div>
    <label className="block text-sm">Location appearance
      <textarea className="mt-1 w-full rounded border border-neutral-300 p-2" rows={3} value={description} onChange={e => setDescription(e.target.value)} placeholder="Architecture, setting, era, materials, mood, and other visual details" />
    </label>
    <button className={button} disabled={ai.busy || ai.mode !== "live" || description.trim().length < 3} onClick={() => void generateLooks()}>{ai.busy ? "Generating…" : state.looksImageId ? "Regenerate 16 locations" : "Generate 16 locations"}</button>
    {tiles.length === 16 && <div className="grid grid-cols-4 gap-2" role="group" aria-label="Location designs">
      {tiles.map((src, index) => <button key={index} type="button" className={`overflow-hidden rounded border-2 ${state.selectedLook === index ? "border-blue-600" : "border-transparent"}`} aria-label={`Choose location ${index + 1}`} aria-pressed={state.selectedLook === index} onClick={() => onChange({ ...state, selectedLook: index, timeImageIds: {} })}><img src={src} alt={`Location design ${index + 1}`} className="w-full aspect-square object-cover" /></button>)}
    </div>}
    {state.selectedLook !== null && <button className={button} disabled={ai.busy || ai.mode !== "live" || !tiles[state.selectedLook]} onClick={() => void generateTimes()}>{ai.busy ? "Generating four images…" : "Generate four times of day"}</button>}
    {Object.keys(timeUrls).length > 0 && <div className="grid gap-3 sm:grid-cols-2">
      {LOCATION_IMAGE_TIMES.map(time => timeUrls[time] && <figure key={time} className="space-y-1"><img src={timeUrls[time]} alt={`${locationName} in the ${time}`} className="w-full rounded border border-neutral-200" /><figcaption className="flex items-center justify-between text-sm capitalize"><span>{time}</span><a href={timeUrls[time]} download={`${locationName.replace(/[^a-z0-9-]+/gi, "-")}-${time}.png`} className="text-blue-700 underline">Download</a></figcaption></figure>)}
    </div>}
    {ai.mode === "fixture" && <p className="text-xs text-neutral-600">Location images require a live image generation endpoint.</p>}
    <AiNotices ai={ai} />
    {loadError && <p role="alert" className="text-sm text-red-600">{loadError}</p>}
  </section>;
}
