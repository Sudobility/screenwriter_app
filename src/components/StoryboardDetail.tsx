import type { ScriptEditorHost } from "@sudobility/writing_ui";
import { useModelTick } from "../util/use-model-tick";
import { ensureStoryEntity, findStoryEntity } from "../util/story-info";
import { ProductionImagesSection, type ProductionImage } from "./ProductionImagesSection";

export function StoryboardDetail({ host, documentId, projectId, sceneId }: {
  host: ScriptEditorHost; documentId: string; projectId: string; sceneId: string;
}) {
  useModelTick(host);
  const scene = host.model.scenes().find(item => String(item.id) === sceneId);
  const story = findStoryEntity(host);
  const saved = story?.fields.storyboards;
  const all = saved && typeof saved === "object" && !Array.isArray(saved)
    ? saved as Record<string, ProductionImage[]> : {};
  const images = Array.isArray(all[sceneId]) ? all[sceneId] : [];
  const onChange = (next: ProductionImage[]) => {
    ensureStoryEntity(host);
    const entity = findStoryEntity(host);
    if (!entity) return;
    host.execute([{ id: "entity.update", params: { entityId: entity.id, patch: { fields: { storyboards: { ...all, [sceneId]: next } } } } }], { kind: "local-command" });
  };
  if (!scene) return <div className="p-6">Scene no longer exists.</div>;
  return <div className="h-full overflow-y-auto p-6"><div className="mx-auto max-w-5xl space-y-4">
    <div><h2 className="text-xl font-semibold">Storyboard: {scene.headingText || "Untitled scene"}</h2><p className="text-sm text-neutral-600">Create and delete visual frames for this scene.</p></div>
    <ProductionImagesSection key={sceneId} documentId={documentId} projectId={projectId} kind="storyboard" subjectId={sceneId} images={images} onChange={onChange} initialDescription={scene.headingText} />
  </div></div>;
}
