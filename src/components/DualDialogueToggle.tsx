import { useEffect } from "react";
import { useEditorSelection, type ScriptEditorHost } from "@sudobility/writing_ui";
import { useModelTick } from "../util/use-model-tick";

const SPEECH_ROLES = new Set(["character", "parenthetical", "dialogue", "lyrics"]);

export type DualState = { kind: "off" } | { kind: "on" } | { kind: "unavailable"; why: string };

/** Is the element at the caret in a dual pair (`on`), or could `dual.make` pair it with the block before it (`off`)? */
export function dualStateOf(host: ScriptEditorHost, elementId: string | undefined): DualState {
  const model = host.model;
  const el = elementId ? model.element(elementId as never) : undefined;
  if (!el) return { kind: "unavailable", why: "Put the caret in a dialogue block" };
  if (el.dual) return { kind: "on" };
  const role = model.resolveStyle(el.id).role;
  if (!SPEECH_ROLES.has(role)) return { kind: "unavailable", why: "Put the caret in a dialogue block" };
  // Walk to this block's cue, then require a dialogue block (cue plus speech) right before it.
  const all = model.elements();
  let i = model.indexOf(el.id);
  while (i >= 0 && model.resolveStyle(all[i]!.id).role !== "character") {
    if (!SPEECH_ROLES.has(model.resolveStyle(all[i]!.id).role)) return { kind: "unavailable", why: "Put the caret in a dialogue block" };
    i--;
  }
  if (i <= 0) return { kind: "unavailable", why: "Dual dialogue needs a dialogue block before this one" };
  const before = all[i - 1]!;
  if (!SPEECH_ROLES.has(model.resolveStyle(before.id).role)) return { kind: "unavailable", why: "Dual dialogue needs a dialogue block right before this one" };
  return { kind: "off" };
}

/** Toggles dual dialogue for the block at the caret (`dual.make` pairs it with the previous block, `dual.clear` unpairs). Mod+Alt+D. */
export function DualDialogueToggle({ host }: { host: ScriptEditorHost }) {
  useModelTick(host);
  const selection = useEditorSelection(host);
  const elementId = selection?.head.elementId;
  const state = dualStateOf(host, elementId);

  const toggle = () => {
    if (!elementId || state.kind === "unavailable") return;
    host.execute([{ id: state.kind === "on" ? "dual.clear" : "dual.make", params: { element: elementId } }], { kind: "local-command" });
  };

  // Keyboard shortcut (Ctrl/Cmd + Alt + D); `code`, not `key`, because Alt+D types a symbol on macOS.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || !e.altKey || e.code !== "KeyD") return;
      e.preventDefault();
      toggle();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <button
      type="button"
      data-testid="dual-toggle"
      aria-pressed={state.kind === "on"}
      disabled={state.kind === "unavailable"}
      title={state.kind === "unavailable" ? state.why : "Dual dialogue: speak this block at the same time as the one before it (Ctrl/Cmd+Alt+D)"}
      // Keep the caret in the editor: a click on the button must not move the selection.
      onMouseDown={e => e.preventDefault()}
      onClick={toggle}
      className={`border border-neutral-300 rounded px-3 py-1 text-sm ${state.kind === "on" ? "bg-violet-700 text-white" : "hover:bg-neutral-100 disabled:opacity-40 disabled:hover:bg-transparent"}`}
    >
      Dual dialogue
    </button>
  );
}
