import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { ElementStylePicker, ScriptEditor } from "@sudobility/writing_ui";
import { useDocumentSession, useScreenwriter, type RebasedEvent, type SessionSyncStatus } from "@sudobility/screenwriter_lib";
import { sessionToHost } from "../adapter/session-host";
import { SnapshotsPanel } from "../components/SnapshotsPanel";

/** Remount per document so a fork (route param change) starts from clean state. */
export function EditorPage() {
  const { documentId } = useParams();
  if (!documentId) return null;
  return <Editor key={documentId} documentId={documentId} />;
}

export function statusLabel(s: SessionSyncStatus | null): { label: string; tone: string } {
  if (!s) return { label: "Connecting", tone: "bg-amber-400" };
  if (s.connection === "disconnected" || s.connection === "error") return { label: "Offline", tone: "bg-neutral-400" };
  if (s.connection === "connecting") return { label: "Connecting", tone: "bg-amber-400" };
  if (s.state === "synced") return { label: "Synced", tone: "bg-green-500" };
  return { label: "Syncing", tone: "bg-amber-400" };
}

function Editor({ documentId }: { documentId: string }) {
  const sw = useScreenwriter();
  const navigate = useNavigate();
  const { session, ready, error, syncStatus } = useDocumentSession(documentId);
  const host = useMemo(() => (session ? sessionToHost(session) : null), [session]);
  const [title, setTitle] = useState("");
  const [panelOpen, setPanelOpen] = useState(false);
  const [rebased, setRebased] = useState<RebasedEvent | null>(null);

  useEffect(() => {
    if (!session) return;
    setTitle(session.detail?.title ?? "");
    return session.on("rebased", e => setRebased(e));
  }, [session]);

  const saveTitle = async () => {
    const t = title.trim();
    if (!session || !t || t === session.detail?.title) return;
    try {
      await sw.client.updateDocument(documentId, { title: t });
    } catch (e) {
      console.error("title update failed", e);
    }
  };

  const projectId = session?.detail?.projectId;
  const st = statusLabel(syncStatus);

  return (
    <div className="h-full flex flex-col">
      <header className="bg-white border-b border-neutral-200 px-4 py-2 flex items-center gap-3">
        <Link to={projectId ? `/p/${projectId}` : "/"} className="text-sm text-neutral-600 hover:underline">
          &larr; {projectId ? "Project" : "Home"}
        </Link>
        <input
          aria-label="Document title"
          value={title}
          onChange={e => setTitle(e.target.value)}
          onBlur={() => void saveTitle()}
          onKeyDown={e => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
          className="font-semibold text-lg border border-transparent hover:border-neutral-300 focus:border-neutral-400 rounded px-2 py-0.5 min-w-48"
        />
        {host && <ElementStylePicker host={host} className="border border-neutral-300 rounded px-2 py-1 text-sm" />}
        <span className="ml-auto flex items-center gap-2 text-sm" data-testid="sync-status" data-state={st.label.toLowerCase()}>
          <span className={`inline-block w-2.5 h-2.5 rounded-full ${st.tone}`} />
          {st.label}
        </span>
        <button
          onClick={() => setPanelOpen(o => !o)}
          className="border border-neutral-300 rounded px-3 py-1 text-sm hover:bg-neutral-100"
        >
          Snapshots
        </button>
      </header>

      {rebased && (
        <div role="status" data-testid="rebased-banner" className="bg-amber-100 border-b border-amber-300 px-4 py-2 text-sm flex items-center gap-3">
          <span>
            <strong>Document replaced by snapshot.</strong>{" "}
            {rebased.lostLocalEdits
              ? "Your unsynced local edits were not in the new version; they were preserved locally on this device."
              : "The editor now shows the snapshot content."}
          </span>
          <button onClick={() => setRebased(null)} className="ml-auto underline">
            Dismiss
          </button>
        </div>
      )}

      <div className="flex-1 min-h-0 flex">
        <main className="flex-1 min-w-0">
          {error && <p className="p-6 text-red-600">Could not open the document: {error.message}</p>}
          {!error && !ready && <p className="p-6 text-neutral-500">Opening document...</p>}
          {host && <ScriptEditor host={host} />}
        </main>
        {panelOpen && session && (
          <SnapshotsPanel session={session} onClose={() => setPanelOpen(false)} onForked={id => navigate(`/d/${id}`)} rebasedTick={rebased} />
        )}
      </div>
    </div>
  );
}
