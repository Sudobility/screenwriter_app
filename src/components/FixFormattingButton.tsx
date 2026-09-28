import { useEffect, useState } from "react";
import type { ScriptEditorHost } from "@sudobility/writing_ui";
import { describeFix, findFormatIssues, fixFormatting } from "../util/format-fix";
import { useModelTick } from "../util/use-model-tick";

/**
 * One click for the formatting the writer cannot see: headings, cues and transitions stored in the case they are
 * shown in (capitals), empty lines removed, stray spaces trimmed (`util/format-fix.ts`; no AI). The count is what
 * a click would fix; afterwards the button says what it did.
 */
export function FixFormattingButton({ host, className }: { host: ScriptEditorHost; className?: string }) {
  useModelTick(host);
  const [done, setDone] = useState<string | null>(null);
  useEffect(() => {
    if (!done) return;
    const t = setTimeout(() => setDone(null), 6000);
    return () => clearTimeout(t);
  }, [done]);

  const issues = findFormatIssues(host);
  const title =
    issues.total === 0
      ? "Formatting is clean: capitals, empty lines and spacing are all in order"
      : [
          issues.caseIds.length ? `${issues.caseIds.length} heading(s) or cue(s) typed in lower case` : "",
          issues.emptyIds.length ? `${issues.emptyIds.length} empty line(s)` : "",
          issues.spaceIds.length ? `${issues.spaceIds.length} line(s) with stray spaces` : "",
        ]
          .filter(Boolean)
          .join(", ") + ". Click to fix them all; you can undo it.";

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        data-testid="fix-formatting"
        data-issues={issues.total}
        disabled={issues.total === 0}
        title={title}
        onMouseDown={e => e.preventDefault()}
        onClick={() => setDone(describeFix(fixFormatting(host)))}
        className={className ?? "border border-neutral-300 rounded px-3 py-1 text-sm whitespace-nowrap hover:bg-neutral-100 disabled:opacity-40 disabled:hover:bg-transparent"}
      >
        Fix formatting{issues.total > 0 ? ` (${issues.total})` : ""}
      </button>
      {done && (
        <span role="status" data-testid="fix-formatting-done" className="text-xs text-neutral-600">
          {done}
        </span>
      )}
    </span>
  );
}
