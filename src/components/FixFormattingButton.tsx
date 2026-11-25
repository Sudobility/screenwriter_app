import { useEffect, useState } from "react";
import { WrenchScrewdriverIcon } from "@heroicons/react/24/outline";
import { Tooltip } from "@sudobility/components";
import type { ScriptEditorHost } from "@sudobility/writing_ui";
import { describeFix, findFormatIssues, fixFormatting } from "../util/format-fix";
import { useModelTick } from "../util/use-model-tick";
import { TOOLBAR_ICON } from "../util/control-styles";

/**
 * One click for the formatting the writer cannot see: headings, cues and transitions stored in the case they are
 * shown in (capitals), empty lines removed, stray spaces trimmed (`util/format-fix.ts`; no AI). The count is what
 * a click would fix; afterwards the button says what it did.
 *
 * `iconOnly` renders a compact wrench icon (with a count badge) for the editor toolbar; otherwise it's a text
 * button (used inside review notes, where it takes a `className`).
 */
export function FixFormattingButton({ host, className, iconOnly }: { host: ScriptEditorHost; className?: string; iconOnly?: boolean }) {
  useModelTick(host);
  const [done, setDone] = useState<string | null>(null);
  useEffect(() => {
    if (!done) return;
    const t = setTimeout(() => setDone(null), 6000);
    return () => clearTimeout(t);
  }, [done]);

  const issues = findFormatIssues(host);
  const label = issues.total > 0 ? `Fix formatting (${issues.total})` : "Fix formatting";
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
  const run = () => setDone(describeFix(fixFormatting(host)));

  return (
    <span className="inline-flex items-center gap-2">
      {iconOnly ? (
        <Tooltip content={issues.total > 0 ? title : label} placement="bottom" delayShow={150}>
          <button
            type="button"
            data-testid="fix-formatting"
            data-issues={issues.total}
            disabled={issues.total === 0}
            aria-label={label}
            onMouseDown={e => e.preventDefault()}
            onClick={run}
            className={`${TOOLBAR_ICON} hover:bg-neutral-100 disabled:opacity-40 disabled:hover:bg-transparent`}
          >
            <WrenchScrewdriverIcon className="h-5 w-5" aria-hidden="true" />
            {issues.total > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[1rem] h-4 px-1 rounded-full bg-amber-500 text-white text-[10px] leading-4 text-center">
                {issues.total}
              </span>
            )}
          </button>
        </Tooltip>
      ) : (
        <button
          type="button"
          data-testid="fix-formatting"
          data-issues={issues.total}
          disabled={issues.total === 0}
          title={title}
          onMouseDown={e => e.preventDefault()}
          onClick={run}
          className={className ?? "border border-neutral-300 rounded px-3 py-1 text-sm hover:bg-neutral-100 disabled:opacity-40 disabled:hover:bg-transparent"}
        >
          Fix formatting{issues.total > 0 ? ` (${issues.total})` : ""}
        </button>
      )}
      {done && (
        <span role="status" data-testid="fix-formatting-done" className="text-xs text-neutral-600">
          {done}
        </span>
      )}
    </span>
  );
}
