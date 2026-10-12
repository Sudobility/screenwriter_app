import { useEffect, useState } from "react";
import { useProject } from "@sudobility/screenwriter_client";
import { API_URL } from "../config";
import { getServices } from "../services";

interface VisualStyle {
  id: string;
  name: string;
  description: string;
  sampleImageUrl: string;
}
interface VisualStyleGroup {
  id: string;
  name: string;
  styles: VisualStyle[];
}
type Step = "settings" | "groups" | "styles";

const apiBase = API_URL.replace(/\/$/, "");

export function ProjectStyleSettings({
  projectId,
  onClose,
}: {
  projectId: string;
  onClose(): void;
}) {
  const project = useProject(projectId);
  const [groups, setGroups] = useState<VisualStyleGroup[]>([]);
  const [step, setStep] = useState<Step>("settings");
  const [groupId, setGroupId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState("");
  const selectedStyleId = (project.data as (typeof project.data & { visualStyleId?: string | null }) | undefined)?.visualStyleId ?? null;
  const group = groups.find((item) => item.id === groupId);
  const selectedStyle = groups.flatMap((item) => item.styles).find((item) => item.id === selectedStyleId);
  const canEdit = ["owner", "admin", "writer"].includes(project.data?.role ?? "");

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    void fetch(`${apiBase}/api/v1/visual-styles`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Could not load visual styles.");
        const body = await response.json() as {
          success: boolean;
          data?: { groups: VisualStyleGroup[] };
          error?: string;
        };
        if (!body.success || !body.data) throw new Error(body.error ?? "Could not load visual styles.");
        setGroups(body.data.groups);
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Could not load visual styles.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, []);

  async function chooseStyle(styleId: string | null) {
    if (!canEdit || saving !== null) return;
    if (styleId === selectedStyleId) return;
    setSaving(styleId ?? "none");
    setError("");
    try {
      const token = await getServices().auth.getToken();
      const headers = { ...(token ? { Authorization: `Bearer ${token}` } : {}) };
      const countResponse = await fetch(`${apiBase}/api/v1/projects/${encodeURIComponent(projectId)}/generated-images`, { headers });
      const countBody = await countResponse.json() as { success: boolean; data?: { count: number }; error?: string };
      if (!countResponse.ok || !countBody.success) throw new Error(countBody.error ?? "Could not count generated images.");
      const count = countBody.data?.count ?? 0;
      if (!window.confirm(`Changing the project image style will permanently delete ${count} generated image${count === 1 ? "" : "s"} from this project, including character, location, prop, storyboard, wardrobe, makeup, vehicle, and set dressing images. Continue?`)) return;
      const response = await fetch(`${apiBase}/api/v1/projects/${encodeURIComponent(projectId)}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...headers,
        },
        body: JSON.stringify({ visualStyleId: styleId, confirmDeleteGeneratedImages: true }),
      });
      const body = await response.json() as { success: boolean; error?: string };
      if (!response.ok || !body.success) throw new Error(body.error ?? "Could not save visual style.");
      await project.refetch();
      await getServices().screenwriter.stores.projects.getState().load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save visual style.");
    } finally {
      setSaving(null);
    }
  }

  return (
    <section className="space-y-5">
      <div className="flex items-center gap-3">
        <button type="button" className="rounded border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-50" onClick={() => {
          if (step === "styles") setStep("groups");
          else if (step === "groups") setStep("settings");
          else onClose();
        }}>Back</button>
        <h2 className="text-xl font-semibold">
          {step === "settings" ? "Project settings" : step === "groups" ? "Choose Style" : group?.name ?? "Styles"}
        </h2>
      </div>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      {step === "settings" && (
        <div className="space-y-3">
          <button type="button" className="flex w-full items-center justify-between rounded-lg border border-neutral-200 bg-white p-4 text-left hover:bg-neutral-50" onClick={() => setStep("groups")}>
            <span><strong className="block">Choose Style</strong><span className="text-sm text-neutral-600">Select the visual look for this project.</span></span>
            <span aria-hidden="true">›</span>
          </button>
          <p className="text-sm text-neutral-600">Current style: {selectedStyle?.name ?? "Undefined"}</p>
        </div>
      )}
      {step === "groups" && (
        <div className="space-y-3">
          <p className="text-sm text-neutral-600">Choose a style group, then select an image.</p>
          {loading && <p>Loading styles...</p>}
          {groups.map((item) => (
            <button key={item.id} type="button" className="flex w-full items-center justify-between rounded-lg border border-neutral-200 bg-white p-4 text-left hover:bg-neutral-50" onClick={() => {
              setGroupId(item.id);
              setStep("styles");
            }}>
              <span><strong className="block">{item.name}</strong><span className="text-sm text-neutral-600">{item.styles.length} styles</span></span>
              <span aria-hidden="true">›</span>
            </button>
          ))}
        </div>
      )}
      {step === "styles" && group && (
        <div className="space-y-4">
          <p className="text-sm text-neutral-600">Choose the image that fits this project. Your choice saves immediately.</p>
          {!canEdit && <p className="text-sm text-neutral-600">You need project edit access to change the style.</p>}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {group.styles.map((style) => {
              const selected = selectedStyleId === style.id;
              return (
                <button key={style.id} type="button" aria-pressed={selected} disabled={!canEdit || saving !== null} onClick={() => void chooseStyle(style.id)}
                  className={`overflow-hidden rounded-lg border-2 bg-white text-left disabled:opacity-60 ${selected ? "border-blue-600" : "border-neutral-200 hover:border-neutral-400"}`}>
                  <img src={new URL(style.sampleImageUrl, apiBase).toString()} alt={`${style.name} sample`} loading="lazy" className="aspect-[4/5] w-full object-cover" />
                  <span className="block p-2"><strong className="block text-sm">{style.name}</strong><span className="block text-xs text-neutral-600">{style.description}</span>{selected && <span className="mt-1 block text-xs font-semibold text-blue-700">Selected</span>}</span>
                </button>
              );
            })}
          </div>
          {selectedStyleId && canEdit && (
            <button type="button" className="rounded border border-neutral-300 px-3 py-2 text-sm hover:bg-neutral-50 disabled:opacity-60" disabled={saving !== null} onClick={() => void chooseStyle(null)}>Clear style</button>
          )}
        </div>
      )}
    </section>
  );
}
