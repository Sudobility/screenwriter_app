import { useEffect, useRef, useState } from "react";
import type { ExportFormatId } from "@sudobility/screenwriter_types";
import { useImportExport, type ExportOutcome } from "@sudobility/screenwriter_lib";
import { ConversionReportView } from "./ConversionReportView";
import { Modal } from "./Modal";
import { downloadBytes } from "../util/download";
import { describeError } from "../util/import-error";

const FALLBACK: { id: ExportFormatId; label: string }[] = [
  { id: "fountain", label: "Fountain" },
  { id: "fdx", label: "Final Draft FDX" },
  { id: "json", label: "Backup (JSON)" },
];
const LABELS: Record<string, string> = { fountain: "Fountain (.fountain)", fdx: "Final Draft (.fdx)", json: "Backup (JSON)" };

const btn = "border border-neutral-300 rounded px-3 py-1 text-sm hover:bg-neutral-100 disabled:opacity-50";
const primary = "bg-neutral-900 text-white rounded px-3 py-1 text-sm";

/** Export menu for the editor top bar. Exports the live document; a lossy conversion asks before downloading. */
export function ExportMenu({ documentId, onPrint }: { documentId: string; onPrint(): void }) {
  const { formats, exporting, exportDocument, error, clearError } = useImportExport();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<ExportOutcome | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => root.current && !root.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const items: { id: ExportFormatId; label: string }[] =
    formats.length > 0
      ? formats.filter(f => f.canExport).map(f => ({ id: f.id as ExportFormatId, label: LABELS[f.id] ?? f.label }))
      : FALLBACK.map(f => ({ ...f, label: LABELS[f.id] ?? f.label }));

  const save = (o: ExportOutcome) => {
    downloadBytes(o.filename, o.mimeType, o.bytes);
    setDone(`Exported ${o.filename}`);
    setPending(null);
    setTimeout(() => setDone(null), 4000);
  };

  const choose = async (id: ExportFormatId) => {
    setOpen(false);
    setDone(null);
    const out = await exportDocument(documentId, id);
    if (!out) return;
    if (out.hasLoss) setPending(out);
    else save(out);
  };

  const err = error ? describeError(error) : null;

  return (
    <div className="relative" ref={root}>
      <button className={btn} data-testid="export-button" aria-haspopup="menu" aria-expanded={open} disabled={exporting} onClick={() => setOpen(o => !o)}>
        {exporting ? "Exporting..." : "Export"}
      </button>
      {open && (
        <ul role="menu" data-testid="export-menu" className="absolute right-0 mt-1 z-40 bg-white border border-neutral-300 rounded shadow-lg py-1 min-w-52 text-sm">
          {items.map(i => (
            <li key={i.id} role="none">
              <button role="menuitem" data-testid={`export-${i.id}`} className="w-full text-left px-3 py-1.5 hover:bg-neutral-100" onClick={() => void choose(i.id)}>
                {i.label}
              </button>
            </li>
          ))}
          <li role="none">
            <button
              role="menuitem"
              data-testid="export-pdf"
              className="w-full text-left px-3 py-1.5 hover:bg-neutral-100 border-t border-neutral-200"
              onClick={() => {
                setOpen(false);
                onPrint();
              }}
            >
              PDF (print)
            </button>
          </li>
        </ul>
      )}
      {done && (
        <div role="status" data-testid="export-done" className="absolute right-0 mt-1 z-30 bg-neutral-900 text-white text-xs rounded px-3 py-1.5 whitespace-nowrap">
          {done}
        </div>
      )}
      {err && (
        <div role="alert" data-testid="export-error" className="absolute right-0 mt-1 z-30 bg-red-50 border border-red-300 text-red-900 text-sm rounded p-2 w-72">
          {err.message}{" "}
          <button className="underline" onClick={clearError}>
            Dismiss
          </button>
        </div>
      )}
      {pending && (
        <Modal title={`Export to ${pending.format.toUpperCase()}: some features are not kept`} testId="export-report">
          <ConversionReportView report={pending.report} />
          <div className="flex gap-2 justify-end mt-4">
            <button className={btn} data-testid="export-cancel" onClick={() => setPending(null)}>
              Cancel
            </button>
            <button className={primary} data-testid="export-anyway" onClick={() => save(pending)}>
              Download anyway
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
