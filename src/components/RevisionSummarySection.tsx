import { useMemo, useState } from "react";
import type { ScriptEditorHost } from "@sudobility/writing_ui";
import { useScreenwriter } from "@sudobility/screenwriter_lib";
import { useSnapshots } from "@sudobility/screenwriter_client";
import type { RevisionChangeKind, RevisionDiffResult } from "@sudobility/screenwriter_types";
import { useAiActions } from "../hooks/useAiActions";
import { AiNotices } from "./AiNotices";

const primary = "bg-neutral-900 text-white rounded px-3 py-1 text-sm hover:bg-neutral-800 disabled:opacity-50";

const MAX = 120_000;

const KIND_CLASS: Record<RevisionChangeKind, string> = {
  added: "bg-emerald-100 text-emerald-800",
  cut: "bg-red-100 text-red-800",
  rewritten: "bg-amber-100 text-amber-800",
  moved: "bg-sky-100 text-sky-800",
  other: "bg-neutral-100 text-neutral-700",
};

/** A DocumentJSON (or the live model) serialized to plain text for the diff, capped. */
function textOf(elements: readonly { text: { plain: string } }[]): string {
  const lines: string[] = [];
  for (const e of elements) {
    const t = e.text.plain.trim();
    if (t) lines.push(t);
  }
  return lines.join("\n").slice(0, MAX);
}

/**
 * What changed in the STORY since a snapshot: an AI comparison of a chosen snapshot against the current script,
 * reported as an overall summary, a list of story-level changes, and how each character/thread's arc drifted.
 */
export function RevisionSummarySection({ documentId, host }: { documentId: string; host: ScriptEditorHost }) {
  const sw = useScreenwriter();
  const ai = useAiActions();
  const snapshotsQ = useSnapshots(documentId);
  const [sid, setSid] = useState("");
  const [result, setResult] = useState<RevisionDiffResult | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const snapshots = useMemo(
    () => [...(snapshotsQ.data?.snapshots ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [snapshotsQ.data]
  );
  const chosen = sid || snapshots[0]?.id || "";

  const run = async () => {
    setMessage(null);
    const snap = snapshots.find(s => s.id === chosen);
    if (!snap) {
      setMessage("Take a snapshot first, then compare the current script against it.");
      return;
    }
    const before = textOf(await sw.client.getSnapshotContent(snap.id).then(d => d.elements).catch(() => []));
    const after = textOf(host.model.elements());
    if (!before || !after) {
      setMessage("Could not read one of the versions.");
      return;
    }
    const res = await ai.run(client =>
      client.revisionDiff({ before, after, beforeLabel: snap.name || "Snapshot", afterLabel: "Current" })
    );
    if (res) setResult(res.result);
  };

  return (
    <section className="space-y-2" data-testid="ai-revision-section">
      <h3 className="text-xs font-semibold uppercase text-neutral-500">What changed since…</h3>
      <p className="text-xs text-neutral-600">A story-level summary of what changed between a snapshot and the current script.</p>
      {snapshots.length === 0 ? (
        <p className="text-xs text-neutral-500">Take a snapshot first (Snapshots panel), then come back to compare.</p>
      ) : (
        <>
          <select className="w-full rounded border border-neutral-300 px-2 py-1 text-xs" data-testid="ai-revision-snapshot" value={chosen} onChange={e => setSid(e.target.value)} disabled={ai.busy}>
            {snapshots.map(s => (
              <option key={s.id} value={s.id}>
                {s.name || "Snapshot"} — {new Date(s.createdAt).toLocaleString()}
              </option>
            ))}
          </select>
          <button className={primary} data-testid="ai-revision-button" disabled={ai.busy || !ai.available} onClick={() => void run()}>
            {ai.busy ? "Comparing…" : "Summarize changes"}
          </button>
        </>
      )}
      <AiNotices ai={ai} showTestBanner={false} />
      {message && <p role="status" className="text-xs text-neutral-700">{message}</p>}
      {result && (
        <div className="space-y-2 rounded border border-neutral-200 bg-white p-2 text-xs" data-testid="ai-revision-result">
          <p className="whitespace-pre-wrap" data-testid="ai-revision-summary">{result.summary}</p>
          {result.changes.length > 0 && (
            <ul className="space-y-1">
              {result.changes.map((c, i) => (
                <li key={i} data-testid="ai-revision-change">
                  <span className={`mr-1 rounded px-1.5 py-0.5 text-[10px] font-medium ${KIND_CLASS[c.kind]}`}>{c.kind}</span>
                  <span className="font-medium">{c.title}</span>
                  {c.detail ? <span className="text-neutral-600"> — {c.detail}</span> : null}
                </li>
              ))}
            </ul>
          )}
          {result.arcs.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold uppercase text-neutral-500">Arc drift</p>
              <ul className="space-y-0.5">
                {result.arcs.map((a, i) => (
                  <li key={i} data-testid="ai-revision-arc"><span className="font-medium">{a.subject}:</span> {a.change}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
