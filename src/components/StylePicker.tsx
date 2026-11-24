import { useMemo } from "react";
import { resolveStyle } from "@sudobility/writing_core";
import {
  useEditorSelection,
  getSelectionStore,
  type ScriptEditorHost,
} from "@sudobility/writing_ui";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@sudobility/components";

/**
 * The element-style picker (Scene Heading / Action / Character / …) built on the design system's
 * `Select` instead of a native `<select>`. It mirrors the logic of writing_ui's `ElementStylePicker`
 * — read the current selection's style, list the template's styles, apply a choice to the selected
 * element(s) — but renders the shared DS dropdown so it matches the rest of the app's chrome.
 *
 * writing_ui stays free of a `@sudobility/components` dependency (it only exposes the selection
 * primitives used here); the design-system binding lives in the app, where the DS is already a dep.
 *
 * A DS `Select` is a button-triggered dropdown, not a focused native `<select>`, so the native
 * type-ahead hazard that `ElementStylePicker` guards against (a stray letter silently restyling the
 * element) cannot happen here. `onCloseAutoFocus` hands the keyboard back to the editor on close,
 * the way the native picker did via its `apply`.
 */

/** Sentinel for a multi-element selection whose elements have differing styles. */
const MIXED = "__mixed";

function columnOf(
  template: ReturnType<ScriptEditorHost["model"]["template"]>,
  styleId: string
): 0 | 1 | 2 {
  try {
    return resolveStyle(template, styleId as never).column;
  } catch {
    return 0;
  }
}

export function StylePicker({
  host,
  className,
}: {
  host: ScriptEditorHost;
  className?: string;
}) {
  const selection = useEditorSelection(host);
  const model = host.model;
  const template = model.template();
  const styles = template.styles.filter(
    (s) => s.role !== ("root" as never) && s.id !== template.defaults.root
  );

  const ids = useMemo(() => {
    if (!selection) return [];
    const a = model.indexOf(selection.anchor.elementId as never);
    const b = model.indexOf(selection.head.elementId as never);
    if (a < 0 || b < 0) return [];
    return model
      .elements({ from: Math.min(a, b), to: Math.max(a, b) + 1 })
      .map((e) => e.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection, model, model.elementCount()]);

  const current = new Set(ids.map((id) => model.element(id)?.style));
  const value =
    current.size === 1 ? String([...current][0]) : current.size > 1 ? MIXED : "";
  const disabled = ids.length === 0;

  const apply = (styleId: string) => {
    if (!styleId || styleId === MIXED || ids.length === 0) return;
    const store = getSelectionStore(host);
    // Through the editor when one is mounted, so a parenthetical gets (and loses) its parentheses
    // and the caret is placed between them; on its own otherwise.
    store.focusEditor?.();
    if (!store.applyStyle?.(styleId)) {
      host.execute(
        [{ id: "element.setStyle", params: { elements: ids, style: styleId } }],
        { kind: "local-command" }
      );
    }
  };

  return (
    <Select
      // A sentinel/empty value has no matching item, so the placeholder shows.
      value={value || undefined}
      onValueChange={apply}
      disabled={disabled}
    >
      <SelectTrigger
        // Compact + content-sized for the toolbar (the DS default is `h-9 w-full`), and otherwise
        // the DS defaults (rounded-md, border, padding) so it matches the adjacent TechniqueMenu
        // Select. Only width/height/background are overridden.
        className={["h-8 w-auto min-w-0 max-w-56 bg-white text-sm", className]
          .filter(Boolean)
          .join(" ")}
        aria-label="Element style"
        data-testid="style-picker"
      >
        <SelectValue placeholder={value === MIXED ? "Mixed" : "—"} />
      </SelectTrigger>
      <SelectContent
        // Hand the keyboard back to the editor when the dropdown closes, rather than parking it on
        // the trigger — so the writer keeps typing in the script after picking a style.
        onCloseAutoFocus={(e) => {
          e.preventDefault();
          getSelectionStore(host).focusEditor?.();
        }}
      >
        {styles.map((s) => {
          const col = columnOf(template, s.id);
          return (
            <SelectItem key={s.id} value={s.id}>
              {s.name}
              {col ? ` · column ${col}` : ""}
              {s.shortcut !== null ? ` (⌘${s.shortcut})` : ""}
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}
