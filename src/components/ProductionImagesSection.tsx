import { useEffect, useState } from "react";
import { useProject } from "@sudobility/screenwriter_client";
import { useScreenwriter } from "@sudobility/screenwriter_lib";
import type { ProductionImageKind, ProductionImageRecord } from "@sudobility/screenwriter_types";
import { ImageUploadButton } from "./ImageUploadButton";

export type ProductionKind = ProductionImageKind;
export type ProductionImage = ProductionImageRecord;

const titles: Record<ProductionKind, string> = {
  storyboard: "Storyboard frames", wardrobe: "Wardrobe designs", makeupHair: "Makeup and hair designs",
  vehicle: "Vehicle designs", setDressing: "Set dressing designs",
};
export function ProductionImagesSection({ documentId, projectId, kind, subjectId, images, onChange, characters = [], initialDescription = "" }: {
  documentId: string; projectId: string; kind: ProductionKind; subjectId: string;
  images: ProductionImage[]; onChange(images: ProductionImage[]): void;
  characters?: { id: string; name: string }[];
  initialDescription?: string;
}) {
  const project = useProject(projectId);
  const sw = useScreenwriter();
  const styleId = (project.data as (typeof project.data & { visualStyleId?: string | null }) | undefined)?.visualStyleId ?? null;
  const [description, setDescription] = useState(initialDescription);
  const [characterId, setCharacterId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [urls, setUrls] = useState<Record<string, string>>({});
  const visible = styleId ? images.filter(image => image.styleId === styleId) : [];
  const needsCharacter = kind === "wardrobe" || kind === "makeupHair";

  useEffect(() => {
    let active = true;
    const made: string[] = [];
    const load = async () => {
      const entries = await Promise.all(visible.map(async image => {
        const bytes = await sw.createProductionImages(documentId, kind, subjectId).image(image.id).catch(() => null);
        if (!bytes) return null;
        const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: "image/png" }));
        made.push(url);
        return [image.id, url] as const;
      }));
      if (active) setUrls(Object.fromEntries(entries.filter((entry): entry is readonly [string, string] => !!entry)));
      else made.forEach(URL.revokeObjectURL);
    };
    void load().catch(() => { if (active) setError("Could not load images."); });
    return () => { active = false; made.forEach(URL.revokeObjectURL); };
    // The IDs and project style determine which files to load.
  }, [sw, documentId, kind, subjectId, styleId, images.map(image => image.id).join(",")]);

  async function generate() {
    if (!styleId || description.trim().length < 3 || busy || (needsCharacter && !characterId)) return;
    setBusy(true); setError("");
    try {
      const character = characters.find(item => item.id === characterId);
      const text = character ? `For character ${character.name}: ${description.trim()}` : description.trim();
      const result = await sw.createProductionImages(documentId, kind, subjectId).generate({ description: text });
      onChange([...images, { id: result.id, description: description.trim(), styleId: result.styleId, ...(character ? { characterId: character.id } : {}) }]);
      setDescription("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not generate image."); }
    finally { setBusy(false); }
  }

  async function remove(imageId: string) {
    setBusy(true); setError("");
    try {
      await sw.createProductionImages(documentId, kind, subjectId).delete(imageId);
      onChange(images.filter(image => image.id !== imageId));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not delete image."); }
    finally { setBusy(false); }
  }

  return <section className="space-y-3 rounded-lg border border-neutral-200 p-4" data-testid={`${kind}-images`}>
    <h3 className="font-semibold">{titles[kind]}</h3>
    {!styleId && <p className="text-sm text-amber-700">Choose a project image style before generating images.</p>}
    {needsCharacter && <label className="block text-sm">Character
      <select className="mt-1 block w-full rounded border border-neutral-300 p-2" value={characterId} onChange={event => setCharacterId(event.target.value)}>
        <option value="">Choose a character</option>
        {characters.map(character => <option key={character.id} value={character.id}>{character.name}</option>)}
      </select>
    </label>}
    <label className="block text-sm">Describe the image
      <textarea className="mt-1 block w-full rounded border border-neutral-300 p-2" rows={3} value={description} onChange={event => setDescription(event.target.value)} placeholder="Appearance, colors, materials, mood, and details" />
    </label>
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" className="rounded border border-neutral-300 px-3 py-1.5 text-sm disabled:opacity-40" disabled={!styleId || busy || description.trim().length < 3 || (needsCharacter && !characterId)} onClick={() => void generate()}>{busy ? "Working…" : "Create image"}</button>
      <ImageUploadButton
        label="Upload an image"
        disabled={!styleId || busy}
        onUpload={async dataUrl => {
          const character = characters.find(item => item.id === characterId);
          const result = await sw.createProductionImages(documentId, kind, subjectId).upload(dataUrl);
          onChange([...images, { id: result.id, description: description.trim(), styleId: result.styleId, ...(character ? { characterId: character.id } : {}) }]);
          setDescription("");
        }}
      />
    </div>
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {visible.map(image => <div key={image.id} className="rounded border border-neutral-200 p-2">
        {urls[image.id] && <img src={urls[image.id]} alt={image.description} className="w-full rounded" />}
        <p className="mt-2 text-sm" data-image-id={image.id}>{image.description}</p>
        <button type="button" className="mt-2 text-sm text-red-700 disabled:opacity-40" disabled={busy} onClick={() => void remove(image.id)}>Delete image</button>
      </div>)}
    </div>
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
  </section>;
}
