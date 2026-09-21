import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { ElementStylePicker, IndexCards, Navigator, PageView, ScriptEditor, useLayout, type PlainPos } from "@sudobility/writing_ui";
import { useDocumentSession, useScreenwriter, type RebasedEvent, type SessionSyncStatus } from "@sudobility/screenwriter_lib";
import { DEV_AUTH } from "../config";
import { sessionToHost } from "../adapter/session-host";
import { AiPanel } from "../components/AiPanel";
import { DualDialogueToggle } from "../components/DualDialogueToggle";
import { PageSetupPanel } from "../components/PageSetupPanel";
import { TitlePagePanel } from "../components/TitlePagePanel";
import { SnapshotsPanel } from "../components/SnapshotsPanel";
import { ExportMenu } from "../components/ExportMenu";

const NAV_KEY = "screenwriter.navigator.open";
const readNavOpen = () => {
  try {
    return localStorage.getItem(NAV_KEY) !== "0";
  } catch {
    return true;
  }
};

type View = "edit" | "pages" | "cards";
const VIEW_LABEL: Record<View, string> = { edit: "Edit", pages: "Pages", cards: "Cards" };

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
  // One right-hand panel at a time.
  const [panel, setPanel] = useState<"snapshots" | "ai" | "title" | "setup" | null>(null);
  const togglePanel = (p: "snapshots" | "ai" | "title" | "setup") => setPanel(cur => (cur === p ? null : p));
  const [rebased, setRebased] = useState<RebasedEvent | null>(null);
  const [view, setViewRaw] = useState<View>("edit");
  const [navOpen, setNavOpen] = useState(readNavOpen);
  const [printPending, setPrintPending] = useState(false);
  const [caret, setCaret] = useState<PlainPos | null>(null);
  // Switching tabs by hand drops any pending "put the caret here" so Edit does not jump back to an old jump target.
  const setView = (v: View) => {
    setCaret(null);
    setViewRaw(v);
  };
  // Navigator click / card double-click: Edit view, caret at the scene heading, scrolled into view (ScriptEditor initialCaret).
  // A fresh object each time so jumping to the same scene twice still re-applies the caret.
  const jumpTo = (elementId: string) => {
    setCaret({ elementId, offset: 0 });
    setViewRaw("edit");
  };
  const toggleNav = () =>
    setNavOpen(o => {
      try {
        localStorage.setItem(NAV_KEY, o ? "0" : "1");
      } catch {
        /* private mode: the toggle still works for this visit */
      }
      return !o;
    });
  // One layout, shared by the page counter (always on) and the Pages view. The engine loads lazily after first paint.
  const layout = useLayout(host);

  // Dev/e2e seam (like writing_ui's `__wuiDebug`): lets a test script the session, e.g. seed a long document.
  useEffect(() => {
    if (!DEV_AUTH || !session) return;
    (window as unknown as { __fadewright?: unknown }).__fadewright = { session };
    return () => {
      delete (window as unknown as { __fadewright?: unknown }).__fadewright;
    };
  }, [session]);

  // "PDF (print)": switch to Pages, wait for the layout, then open the print dialog.
  useEffect(() => {
    if (!printPending || view !== "pages" || layout.status !== "ready") return;
    const t = setTimeout(() => {
      setPrintPending(false);
      window.print();
    }, 300);
    return () => clearTimeout(t);
  }, [printPending, view, layout.status]);

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
  const pageLabel = layout.layout ? `${layout.pageCount} ${layout.pageCount === 1 ? "page" : "pages"}` : "";

  return (
    <div className="h-full flex flex-col print-flow">
      <header className="bg-white border-b border-neutral-200 px-4 py-2 flex items-center gap-3 print:hidden">
        <button
          onClick={toggleNav}
          aria-pressed={navOpen}
          data-testid="navigator-toggle"
          title="Show or hide the scene navigator"
          className={`border border-neutral-300 rounded px-3 py-1 text-sm ${navOpen ? "bg-neutral-800 text-white" : "hover:bg-neutral-100"}`}
        >
          Scenes
        </button>
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
        <div role="tablist" aria-label="View" className="inline-flex rounded border border-neutral-300 overflow-hidden text-sm">
          {(["edit", "pages", "cards"] as const).map(v => (
            <button
              key={v}
              role="tab"
              aria-selected={view === v}
              data-testid={`view-${v}`}
              onClick={() => setView(v)}
              className={`px-3 py-1 ${view === v ? "bg-neutral-800 text-white" : "bg-white hover:bg-neutral-100"}`}
            >
              {VIEW_LABEL[v]}
            </button>
          ))}
        </div>
        {host && view === "edit" && <ElementStylePicker host={host} className="border border-neutral-300 rounded px-2 py-1 text-sm" />}
        {host && view === "edit" && <DualDialogueToggle host={host} />}
        {view === "pages" && (
          <button onClick={() => window.print()} data-testid="print-button" className="border border-neutral-300 rounded px-3 py-1 text-sm hover:bg-neutral-100">
            Print / Save as PDF
          </button>
        )}
        <span className="ml-auto" />
        {ready && (
          <ExportMenu
            documentId={documentId}
            onPrint={() => {
              setView("pages");
              setPrintPending(true);
            }}
          />
        )}
        <span className="text-sm text-neutral-600" data-testid="page-count" data-pages={layout.pageCount} data-status={layout.status}>
          {pageLabel}
        </span>
        <span className="flex items-center gap-2 text-sm" data-testid="sync-status" data-state={st.label.toLowerCase()}>
          <span className={`inline-block w-2.5 h-2.5 rounded-full ${st.tone}`} />
          {st.label}
        </span>
        <button
          onClick={() => togglePanel("title")}
          aria-pressed={panel === "title"}
          data-testid="title-button"
          className={`border border-neutral-300 rounded px-3 py-1 text-sm ${panel === "title" ? "bg-neutral-800 text-white" : "hover:bg-neutral-100"}`}
        >
          Title page
        </button>
        <button
          onClick={() => togglePanel("setup")}
          aria-pressed={panel === "setup"}
          data-testid="setup-button"
          className={`border border-neutral-300 rounded px-3 py-1 text-sm ${panel === "setup" ? "bg-neutral-800 text-white" : "hover:bg-neutral-100"}`}
        >
          Page setup
        </button>
        <button
          onClick={() => togglePanel("ai")}
          aria-pressed={panel === "ai"}
          data-testid="ai-button"
          className={`border border-neutral-300 rounded px-3 py-1 text-sm ${panel === "ai" ? "bg-neutral-800 text-white" : "hover:bg-neutral-100"}`}
        >
          AI
        </button>
        <button
          onClick={() => togglePanel("snapshots")}
          aria-pressed={panel === "snapshots"}
          className={`border border-neutral-300 rounded px-3 py-1 text-sm ${panel === "snapshots" ? "bg-neutral-800 text-white" : "hover:bg-neutral-100"}`}
        >
          Snapshots
        </button>
      </header>

      {rebased && (
        <div role="status" data-testid="rebased-banner" className="print:hidden bg-amber-100 border-b border-amber-300 px-4 py-2 text-sm flex items-center gap-3">
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

      <div className="flex-1 min-h-0 flex print-flow">
        {host && navOpen && (
          <aside data-testid="navigator-sidebar" className="w-72 shrink-0 border-r border-neutral-200 bg-white min-h-0 print:hidden">
            <Navigator host={host} onJumpTo={jumpTo} />
          </aside>
        )}
        <main className="flex-1 min-w-0 print-flow">
          {error && <p className="p-6 text-red-600">Could not open the document: {error.message}</p>}
          {!error && !ready && <p className="p-6 text-neutral-500">Opening document...</p>}
          {host && view === "edit" && <ScriptEditor host={host} initialCaret={caret} />}
          {host && view === "cards" && <IndexCards host={host} onOpenScene={jumpTo} />}
          {host && view === "pages" && (
            <PageView
              host={host}
              layout={layout}
              onRequestEdit={(elementId, offset) => {
                setCaret({ elementId, offset });
                setViewRaw("edit");
              }}
            />
          )}
        </main>
        {panel === "snapshots" && session && (
          <SnapshotsPanel session={session} onClose={() => setPanel(null)} onForked={id => navigate(`/d/${id}`)} rebasedTick={rebased} />
        )}
        {panel === "title" && host && <TitlePagePanel host={host} onClose={() => setPanel(null)} />}
        {panel === "setup" && host && <PageSetupPanel host={host} onClose={() => setPanel(null)} />}
        {panel === "ai" && host && <AiPanel documentId={documentId} host={host} onJumpTo={jumpTo} onClose={() => setPanel(null)} />}
      </div>
    </div>
  );
}
