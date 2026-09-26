import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { DocumentSession, RebasedEvent } from "@sudobility/screenwriter_lib";
import type { SnapshotListResponse, VersionListItem, VersionPoint } from "@sudobility/screenwriter_types";

const btn = "border border-neutral-300 rounded px-2 py-0.5 text-xs hover:bg-neutral-100 disabled:opacity-50";

interface Props {
  session: DocumentSession;
  onClose(): void;
  onForked(documentId: string): void;
  /** Changes when the document was replaced; the lists are reloaded. */
  rebasedTick: RebasedEvent | null;
}

const isVersionPoint = (v: VersionListItem): v is VersionPoint => !("marker" in v);
const fmt = (iso: string) => new Date(iso).toLocaleString();

export function SnapshotsPanel({ session, onClose, onForked, rebasedTick }: Props) {
  const [list, setList] = useState<SnapshotListResponse | null>(null);
  const [versions, setVersions] = useState<VersionPoint[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [confirmOpen, setConfirmOpen] = useState<string | null>(null);
  const [forking, setForking] = useState<string | null>(null);
  const [forkTitle, setForkTitle] = useState("");

  const refresh = useCallback(async () => {
    try {
      const [snaps, vers] = await Promise.all([session.listSnapshots({ includeAutomatic: true }), session.listVersions()]);
      setList(snaps);
      setVersions(vers.items.filter(isVersionPoint));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [session]);

  useEffect(() => {
    void refresh();
  }, [refresh, rebasedTick]);

  const guard = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const save = (e: FormEvent) => {
    e.preventDefault();
    void guard(async () => {
      await session.createSnapshot(name.trim(), note.trim() || undefined);
      setName("");
      setNote("");
      await refresh();
    });
  };

  const byId = new Map((list?.snapshots ?? []).map(s => [s.id, s]));
  const manual = (list?.snapshots ?? []).filter(s => s.kind === "manual");
  const auto = (list?.snapshots ?? []).filter(s => s.kind === "auto");

  const row = (s: SnapshotListResponse["snapshots"][number]) => (
    <li key={s.id} className="border border-neutral-200 rounded p-2 bg-white" data-testid="snapshot-row" data-snapshot-name={s.name}>
      <div className="flex items-center gap-2">
        <span className="font-medium text-sm">{s.name}</span>
        <span className="text-[10px] uppercase tracking-wide text-neutral-500 border border-neutral-300 rounded px-1">
          {s.kind === "auto" ? `auto${s.autoReason ? `: ${s.autoReason}` : ""}` : "manual"}
        </span>
        {list?.liveParentSnapshotId === s.id && <span className="text-[10px] text-green-700">current base</span>}
      </div>
      {s.note && <div className="text-xs text-neutral-600 mt-0.5">{s.note}</div>}
      <div className="text-xs text-neutral-500 mt-0.5">
        {fmt(s.createdAt)}
        {s.parentId && <> - from {byId.get(s.parentId)?.name ?? "earlier snapshot"}</>}
      </div>
      {confirmOpen === s.id ? (
        <div className="mt-2 text-xs bg-amber-50 border border-amber-300 rounded p-2">
          Replace the current document content with this snapshot? Your current state is saved automatically first.
          <div className="flex gap-2 mt-1">
            <button
              className={`${btn} bg-neutral-900 text-white hover:bg-neutral-800`}
              disabled={busy}
              onClick={() =>
                void guard(async () => {
                  await session.openSnapshot(s.id);
                  setConfirmOpen(null);
                  await refresh();
                })
              }
            >
              Replace content
            </button>
            <button className={btn} onClick={() => setConfirmOpen(null)}>
              Cancel
            </button>
          </div>
        </div>
      ) : forking === s.id ? (
        <form
          className="mt-2 flex gap-1"
          onSubmit={e => {
            e.preventDefault();
            void guard(async () => {
              const doc = await session.forkSnapshot(s.id, forkTitle.trim());
              setForking(null);
              onForked(doc.id);
            });
          }}
        >
          <input
            spellCheck={true}
            autoCorrect="off"
            aria-label="Fork title"
            required
            autoFocus
            value={forkTitle}
            onChange={e => setForkTitle(e.target.value)}
            className="flex-1 border border-neutral-300 rounded px-2 py-0.5 text-xs"
          />
          <button type="submit" className={btn} disabled={busy}>
            Create fork
          </button>
          <button type="button" className={btn} onClick={() => setForking(null)}>
            Cancel
          </button>
        </form>
      ) : (
        <div className="flex gap-2 mt-2">
          <button
            className={btn}
            onClick={() => {
              setForking(null);
              setConfirmOpen(s.id);
            }}
          >
            Open
          </button>
          <button
            className={btn}
            onClick={() => {
              setConfirmOpen(null);
              setForkTitle(`${session.detail?.title ?? "Untitled"} - ${s.name}`);
              setForking(s.id);
            }}
          >
            Fork
          </button>
        </div>
      )}
    </li>
  );

  return (
    <aside className="print:hidden w-96 shrink-0 border-l border-neutral-200 bg-neutral-50 overflow-y-auto p-3 space-y-4" aria-label="Snapshots" data-testid="snapshots-panel">
      <div className="flex items-center">
        <h2 className="font-semibold">Snapshots</h2>
        <button className={`${btn} ml-auto`} onClick={onClose}>
          Close
        </button>
      </div>
      <p className="text-xs text-neutral-600">
        A snapshot freezes the script as it is now. Open one to go back to it, or fork one to try a different branch in a new document.
      </p>
      <form onSubmit={save} className="space-y-1">
        <input
          spellCheck={true}
          autoCorrect="off"
          aria-label="Snapshot name"
          required
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Snapshot name"
          className="w-full border border-neutral-300 rounded px-2 py-1 text-sm"
        />
        <input
          spellCheck={true}
          autoCorrect="off"
          aria-label="Snapshot note"
          value={note}
          onChange={e => setNote(e.target.value)}
          placeholder="Note (optional)"
          className="w-full border border-neutral-300 rounded px-2 py-1 text-sm"
        />
        <button type="submit" disabled={busy || !name.trim()} className="bg-neutral-900 text-white rounded px-3 py-1 text-sm disabled:opacity-50">
          Save snapshot
        </button>
      </form>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <section>
        <h3 className="text-xs font-semibold uppercase text-neutral-500 mb-1">Your snapshots</h3>
        {manual.length === 0 ? <p className="text-xs text-neutral-500">None yet.</p> : <ul className="space-y-2">{manual.map(row)}</ul>}
      </section>
      {auto.length > 0 && (
        <section>
          <h3 className="text-xs font-semibold uppercase text-neutral-500 mb-1">Automatic snapshots</h3>
          <ul className="space-y-2">{auto.map(row)}</ul>
        </section>
      )}
      <section>
        <h3 className="text-xs font-semibold uppercase text-neutral-500 mb-1">Automatic version points</h3>
        {versions.length === 0 ? (
          <p className="text-xs text-neutral-500">None yet (one is recorded every few minutes while you edit).</p>
        ) : (
          <ul className="text-xs text-neutral-700 space-y-0.5" data-testid="version-list">
            {versions.map(v => (
              <li key={v.id}>
                {fmt(v.createdAt)} - {v.reason} - {v.stats.words} words
              </li>
            ))}
          </ul>
        )}
      </section>
    </aside>
  );
}
