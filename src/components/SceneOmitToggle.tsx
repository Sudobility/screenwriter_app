import { useEffect } from "react";
import { useEditorSelection, type ScriptEditorHost } from "@sudobility/writing_ui";
import { useModelTick } from "../util/use-model-tick";

/** The scene containing the caret, and whether it is omitted. */
export function currentScene(host: ScriptEditorHost, elementId: string | undefined): { id: string; omitted: boolean } | null {
  if (!elementId) return null;
  const scene = host.model.sceneOf(elementId as never);
  return scene ? { id: String(scene.id), omitted: scene.omitted } : null;
}

/** Omit / Restore the scene at the caret (`scene.setOmitted`). Ctrl/Cmd+Alt+O. */
export function SceneOmitToggle({ host }: { host: ScriptEditorHost }) {
  useModelTick(host);
  const selection = useEditorSelection(host);
  const scene = currentScene(host, selection?.head.elementId);

  const toggle = () => {
    if (!scene) return;
    host.execute([{ id: "scene.setOmitted", params: { scene: scene.id, omitted: !scene.omitted } }], { kind: "local-command" });
  };

  // `code`, not `key`: Alt+O types a symbol on macOS.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || !e.altKey || e.code !== "KeyO") return;
      e.preventDefault();
      toggle();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <button
      type="button"
      data-testid="omit-toggle"
      aria-pressed={scene?.omitted === true}
      disabled={!scene}
      title={scene ? `${scene.omitted ? "Restore" : "Omit"} the current scene (Ctrl/Cmd+Alt+O)` : "Put the caret in a scene"}
      onMouseDown={e => e.preventDefault()}
      onClick={toggle}
      className={`border border-neutral-300 rounded px-3 py-1 text-sm whitespace-nowrap ${scene?.omitted ? "bg-amber-600 text-white" : "hover:bg-neutral-100 disabled:opacity-40 disabled:hover:bg-transparent"}`}
    >
      {scene?.omitted ? "Restore scene" : "Omit scene"}
    </button>
  );
}
