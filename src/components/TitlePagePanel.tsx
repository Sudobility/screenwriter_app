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
export function TitlePagePanel({ host }: { host: ScriptEditorHost }) {
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
    <>
      <p className="text-xs text-neutral-600">Shown as the first, unnumbered page in the Pages view. Leave everything empty for no title page.</p>
      {FIELDS.map(({ field, label, multiline, hint }) => (
        <label key={field} className="block text-xs font-medium text-neutral-700">
          {label}
          {multiline ? (
            <textarea
              spellCheck={!["author", "contact", "draftDate"].includes(field)}
              autoCorrect="off"
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
              spellCheck={!["author", "contact", "draftDate"].includes(field)}
              autoCorrect="off"
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
    </>
  );
}
