import type { ConversionReport } from "@sudobility/screenwriter_types";

const GROUPS = [
  { severity: "error", title: "Errors", tone: "border-red-400 bg-red-50 text-red-900" },
  { severity: "loss", title: "Lost (did not survive the conversion)", tone: "border-red-300 bg-red-50 text-red-900" },
  { severity: "warn", title: "Warnings", tone: "border-amber-300 bg-amber-50 text-amber-900" },
  { severity: "info", title: "Notes", tone: "border-neutral-200 bg-neutral-50 text-neutral-700" },
] as const;

/** Conversion report grouped by severity, with counts. Lost features are the loudest thing in it. */
export function ConversionReportView({ report }: { report: ConversionReport }) {
  const s = report.summary;
  const lossy = s.loss + s.error > 0;
  return (
    <div data-testid="conversion-report" data-loss={s.loss} data-warn={s.warn} data-info={s.info}>
      <p className="text-sm mb-2" data-testid="report-summary">
        <span className={s.loss > 0 ? "font-semibold text-red-700" : ""}>{s.loss} lost</span>
        {" - "}
        <span className={s.warn > 0 ? "font-semibold text-amber-700" : ""}>{s.warn} warnings</span>
        {" - "}
        {s.info} notes
        {s.error > 0 && <span className="font-semibold text-red-700"> - {s.error} errors</span>}
        <span className="text-neutral-500">
          {" "}
          ({report.stats.elements} elements, {report.stats.scenes} scenes)
        </span>
      </p>
      {lossy && (
        <p className="text-sm font-semibold text-red-700 mb-2" role="alert" data-testid="loss-banner">
          Some features did not survive this conversion. Review the list below.
        </p>
      )}
      {report.diagnostics.length === 0 && <p className="text-sm text-neutral-500">Nothing to report: the conversion was clean.</p>}
      {GROUPS.map(g => {
        const items = report.diagnostics.filter(d => d.severity === g.severity);
        if (items.length === 0) return null;
        return (
          <section key={g.severity} className={`border rounded p-2 mb-2 ${g.tone}`} data-testid={`report-${g.severity}`}>
            <h4 className="text-sm font-semibold">
              {g.title} ({items.length})
            </h4>
            <ul className="text-sm list-disc pl-5">
              {items.map((d, i) => (
                <li key={`${d.code}-${i}`}>
                  {d.message}
                  {d.count > 1 && <span className="opacity-70"> (x{d.count})</span>}
                  <span className="opacity-60"> [{d.feature}]</span>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
