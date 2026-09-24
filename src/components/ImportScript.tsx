import { useRef, useState, type DragEvent, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { FormModal } from "@sudobility/components";
import { useImportExport, type ImportOutcome } from "@sudobility/screenwriter_lib";
import { useLang } from "../hooks/useLang";
import { ConversionReportView } from "./ConversionReportView";
import { describeError } from "../util/import-error";

const btn = "border border-neutral-300 rounded px-3 py-1 text-sm hover:bg-neutral-100 disabled:opacity-50";
const FALLBACK_ACCEPT = [".fountain", ".fdx", ".fadein", ".txt"];

/**
 * "Import script" button + drop target + results dialog. `children` is the area that accepts drops
 * (the documents list); the button and the drop both go through the same import.
 */
export function ImportScript({ projectId, children }: { projectId: string; children: ReactNode }) {
  const { formats, importing, importScript, error, clearError } = useImportExport();
  const navigate = useNavigate();
  const lang = useLang();
  const input = useRef<HTMLInputElement>(null);
  const [result, setResult] = useState<ImportOutcome | null>(null);
  const [dragging, setDragging] = useState(false);

  const accept = Array.from(new Set([...FALLBACK_ACCEPT, ...formats.filter(f => f.canImport).flatMap(f => f.extensions)])).join(",");

  const run = async (file: File | undefined) => {
    if (!file) return;
    setResult(null);
    const bytes = new Uint8Array(await file.arrayBuffer());
    const out = await importScript(projectId, { filename: file.name, bytes });
    if (out) setResult(out);
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    void run(e.dataTransfer.files[0]);
  };

  const err = error ? describeError(error) : null;

  return (
    <div
      data-testid="import-dropzone"
      data-dragging={dragging}
      onDragOver={e => {
        if (!Array.from(e.dataTransfer.types).includes("Files")) return;
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={e => e.currentTarget === e.target && setDragging(false)}
      onDrop={onDrop}
      className={`rounded min-h-32 ${dragging ? "outline outline-2 outline-dashed outline-blue-500 bg-blue-50" : ""}`}
    >
      <div className="flex items-center gap-3 mb-3">
        <button className={btn} data-testid="import-button" disabled={importing} onClick={() => input.current?.click()}>
          {importing ? "Importing..." : "Import script"}
        </button>
        <input
          ref={input}
          type="file"
          accept={accept}
          data-testid="import-file"
          className="hidden"
          onChange={e => {
            const f = e.target.files?.[0];
            e.target.value = "";
            void run(f);
          }}
        />
        <span className="text-xs text-neutral-500">or drop a file on the list</span>
      </div>
      {err && (
        <div role="alert" data-testid="import-error" data-code={err.code} className="border border-red-300 bg-red-50 text-red-900 rounded p-3 mb-3 text-sm">
          <div className="flex items-start gap-3">
            <div className="flex-1">
              <p>{err.message}</p>
              {err.issues.length > 0 && (
                <ul className="list-disc pl-5 mt-1" data-testid="import-issues">
                  {err.issues.map((i, k) => (
                    <li key={k}>{i}</li>
                  ))}
                </ul>
              )}
            </div>
            <button className="underline" onClick={clearError}>
              Dismiss
            </button>
          </div>
        </div>
      )}
      {children}
      <FormModal
        open={!!result}
        title="Import results"
        onClose={() => setResult(null)}
        actions={[
          { label: "Stay here", onClick: () => setResult(null), variant: "ghost" },
          ...(result ? [{ label: "Open document", onClick: () => navigate(`/${lang}/d/${result.document.id}`) }] : []),
        ]}
      >
        {result && (
          <>
            <p className="text-sm mb-1">
              Detected format: <strong data-testid="import-format">{result.format}</strong>
            </p>
            <p className="text-sm mb-3">
              Document: <strong data-testid="import-title">{result.document.title}</strong>
            </p>
            <ConversionReportView report={result.report} />
          </>
        )}
      </FormModal>
    </div>
  );
}
