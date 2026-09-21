import { useEffect, useRef, useState } from "react";
import type { ScriptEditorHost } from "@sudobility/writing_ui";
import { useModelTick } from "../util/use-model-tick";

type Field = "title" | "author" | "basedOn" | "contact" | "draftDate" | "copyright" | "notes";

const FIELDS: { field: Field; label: string; multiline?: boolean; hint?: string }[] = [
  { field: "title", label: "Title" },
  { field: "author", label: "Written by", hint: "Author name(s)" },
  { field: "basedOn", label: "Based on", hint: "e.g. Based on the novel by ..." },
  { field: "contact", label: "Contact", multiline: true, hint: "Name, email, phone" },
  { field: "draftDate", label: "Draft date" },
  { field: "copyright", label: "Copyright" },
  { field: "notes", label: "Notes", multiline: true },
];

const input = "w-full border border-neutral-300 rounded px-2 py-1 text-sm bg-white";

/** Title page fields; each edit goes through the `title.setField` command, so it syncs like any other edit. */
export function TitlePagePanel({ host, onClose }: { host: ScriptEditorHost; onClose(): void }) {
  useModelTick(host);
  const stored = (f: Field) => host.model.titlePage().fields[f]?.text ?? "";
  const [draft, setDraft] = useState<Record<string, string>>({});
  const focused = useRef<string | null>(null);

  // Show remote changes to fields the writer is not typing in.
  useEffect(() => {
    setDraft(d => {
      const next = { ...d };
      for (const { field } of FIELDS) if (focused.current !== field) next[field] = stored(field);
      return FIELDS.every(({ field }) => next[field] === d[field]) ? d : next;
    });
  });

  const change = (field: Field, text: string) => {
    setDraft(d => ({ ...d, [field]: text }));
    host.execute([{ id: "title.setField", params: { field, text } }], { kind: "local-typing", groupKey: `title:${field}` });
  };

  return (
    <aside className="print:hidden w-80 shrink-0 border-l border-neutral-200 bg-neutral-50 overflow-y-auto p-3 space-y-3" aria-label="Title page" data-testid="title-panel">
      <div className="flex items-center">
        <h3 className="font-semibold">Title page</h3>
        <button className="ml-auto border border-neutral-300 rounded px-2 py-1 text-xs hover:bg-neutral-100" onClick={onClose}>
          Close
        </button>
      </div>
      <p className="text-xs text-neutral-600">Shown as the first, unnumbered page in the Pages view. Leave everything empty for no title page.</p>
      {FIELDS.map(({ field, label, multiline, hint }) => (
        <label key={field} className="block text-xs font-medium text-neutral-700">
          {label}
          {multiline ? (
            <textarea
              data-testid={`title-${field}`}
              className={`${input} mt-0.5 font-normal`}
              rows={3}
              placeholder={hint}
              value={draft[field] ?? stored(field)}
              onFocus={() => (focused.current = field)}
              onBlur={() => (focused.current = null)}
              onChange={e => change(field, e.target.value)}
            />
          ) : (
            <input
              data-testid={`title-${field}`}
              className={`${input} mt-0.5 font-normal`}
              placeholder={hint}
              value={draft[field] ?? stored(field)}
              onFocus={() => (focused.current = field)}
              onBlur={() => (focused.current = null)}
              onChange={e => change(field, e.target.value)}
            />
          )}
        </label>
      ))}
    </aside>
  );
}
