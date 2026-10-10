import { useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@sudobility/components";
import { getSelectionStore, useEditorSelection, type ScriptEditorHost } from "@sudobility/writing_ui";
import { insertTechnique, placeholdersIn, techniqueById, TECHNIQUES } from "../util/techniques";

/**
 * "Insert technique": montage, intercut, flashback and the like, written the conventional way with [PLACEHOLDERS]
 * for the writer to fill in. One choice inserts it at the caret (undoable) and takes the caret to its first line.
 */
export function TechniqueMenu({ host, onInserted }: { host: ScriptEditorHost; onInserted(firstElementId: string): void }) {
  const selection = useEditorSelection(host);
  const [done, setDone] = useState<string | null>(null);

  const insert = (id: string) => {
    const technique = techniqueById(id);
    if (!technique) return;
    const r = insertTechnique(host, technique, selection?.head.elementId);
    const blanks = technique.rows.reduce((n, row) => n + placeholdersIn(row.text).length, 0);
    setDone(`${technique.label} inserted: fill in the ${blanks} [bracketed] blanks.`);
    setTimeout(() => setDone(null), 8000);
    if (r.firstId) onInserted(r.firstId);
  };

  return (
    <span className="inline-flex items-center gap-2">
      {/* Always shows its placeholder: choosing is an action, not a setting. */}
      <Select value="" onValueChange={insert}>
        <SelectTrigger aria-label="Insert technique" data-testid="technique-menu" className="h-8 w-44 bg-white text-sm">
          <SelectValue placeholder="Insert technique" />
        </SelectTrigger>
        {/* The menu hands the keyboard back to the script, not to its own button: the writer goes on typing. */}
        <SelectContent
          onCloseAutoFocus={(e: Event) => {
            e.preventDefault();
            getSelectionStore(host).focusEditor?.();
          }}
        >
          {TECHNIQUES.map(t => (
            <SelectItem key={t.id} value={t.id} title={t.about}>
              {t.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {done && (
        <span role="status" data-testid="technique-done" className="text-xs text-neutral-600">
          {done}
        </span>
      )}
    </span>
  );
}
