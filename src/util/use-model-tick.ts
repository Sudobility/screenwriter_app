import { useEffect, useReducer } from "react";
import type { ScriptEditorHost } from "@sudobility/writing_ui";

/** Re-renders whenever the host's model changes (local edit, remote edit or rebase). Read `host.model` during render. */
export function useModelTick(host: ScriptEditorHost): void {
  const [, bump] = useReducer((n: number) => n + 1, 0);
  useEffect(() => host.subscribe(() => bump()), [host]);
}
