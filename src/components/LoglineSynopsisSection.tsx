import { useState } from "react";
import type { ScriptEditorHost } from "@sudobility/writing_ui";
import type { LoglineSynopsisResult } from "@sudobility/screenwriter_types";
import { useAiActions } from "../hooks/useAiActions";
import { AiNotices } from "./AiNotices";

const btn = "border border-neutral-300 rounded px-2 py-1 text-xs hover:bg-neutral-100 disabled:opacity-50";
const primary = "bg-neutral-900 text-white rounded px-3 py-1 text-sm hover:bg-neutral-800 disabled:opacity-50";

const MAX = 120_000;

/** The whole script as plain text (headings + lines, in order), capped for the request body. */
function serializeScript(host: ScriptEditorHost): string {
  const lines: string[] = [];
  for (const e of host.model.elements()) {
    const t = e.text.plain.trim();
    if (t) lines.push(t);
  }
  return lines.join("\n").slice(0, MAX);
}

function Field({ label, text }: { label: string; text: string }) {
  const copy = () => void navigator.clipboard?.writeText(text).catch(() => undefined);
  return (
    <div data-testid={`ai-logline-${label.toLowerCase()}`}>
      <div className="flex items-center gap-2">
        <p className="text-[10px] font-semibold uppercase text-neutral-500">{label}</p>
        <button type="button" className="text-[10px] text-neutral-500 underline" onClick={copy}>Copy</button>
      </div>
      <p className="whitespace-pre-wrap">{text}</p>
    </div>
  );
}

/**
 * Pitch material from the whole script: logline, genre, synopsis and a one-to-two-page treatment. A synchronous AI
 * action (gated by consent/credits via useAiActions). The result is shown for the writer to copy; nothing is written
 * into the document.
 */
export function LoglineSynopsisSection({ host }: { host: ScriptEditorHost }) {
  const ai = useAiActions();
  const [result, setResult] = useState<LoglineSynopsisResult | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const generate = async () => {
    setMessage(null);
    const script = serializeScript(host);
    if (!script) {
      setMessage("Write some script first.");
      return;
    }
    const res = await ai.run(client => client.loglineSynopsis({ script }));
    if (res) setResult(res.result);
  };

  return (
    <section className="space-y-2" data-testid="ai-logline-section">
      <h3 className="text-xs font-semibold uppercase text-neutral-500">Logline &amp; synopsis</h3>
      <p className="text-xs text-neutral-600">Pitch material — logline, genre, synopsis and a short treatment — written from the whole script.</p>
      <button className={primary} data-testid="ai-logline-button" disabled={ai.busy || !ai.available} onClick={() => void generate()}>
        {ai.busy ? "Writing…" : result ? "Regenerate" : "Generate logline & synopsis"}
      </button>
      <AiNotices ai={ai} showTestBanner={false} />
      {message && <p role="status" className="text-xs text-neutral-700">{message}</p>}
      {result && (
        <div className="space-y-2 rounded border border-neutral-200 bg-white p-2 text-xs" data-testid="ai-logline-result">
          <Field label="Logline" text={result.logline} />
          {result.genre.length > 0 && <p><span className="font-medium">Genre: </span>{result.genre.join(", ")}</p>}
          <Field label="Synopsis" text={result.synopsis} />
          <Field label="Treatment" text={result.treatment} />
        </div>
      )}
    </section>
  );
}
