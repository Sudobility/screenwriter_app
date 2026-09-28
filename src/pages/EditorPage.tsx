import { useEffect, useMemo, useState } from "react";
import { createPortal, flushSync } from "react-dom";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ChevronLeftIcon } from "@heroicons/react/24/outline";
import { MasterDetailLayout } from "@sudobility/components/master-detail-layout";
import { useLang } from "../hooks/useLang";
import { ElementStylePicker, IndexCards, PageView, ScriptEditor, useLayout, type PlainPos } from "@sudobility/writing_ui";
import { useDocumentSession, useScreenwriter, type RebasedEvent, type SessionSyncStatus } from "@sudobility/screenwriter_lib";
import { DEV_AUTH } from "../config";
import { sessionToHost } from "../adapter/session-host";
import { RevisionIndicator, RevisionsPanel } from "../components/RevisionsPanel";
import { AiPanel } from "../components/AiPanel";
import { DualDialogueToggle } from "../components/DualDialogueToggle";
import { FixFormattingButton } from "../components/FixFormattingButton";
import { TechniqueMenu } from "../components/TechniqueMenu";
import { SceneOmitToggle } from "../components/SceneOmitToggle";
import { PageSetupPanel } from "../components/PageSetupPanel";
import { TitlePagePanel } from "../components/TitlePagePanel";
import { SnapshotsPanel } from "../components/SnapshotsPanel";
import { ExportMenu } from "../components/ExportMenu";
import { EditorSidebar } from "../components/EditorSidebar";
import { EntityDetailView } from "../components/EntityDetailView";

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
  const lang = useLang();
  const { session, ready, error, syncStatus } = useDocumentSession(documentId);
  const host = useMemo(() => (session ? sessionToHost(session) : null), [session]);
  const [title, setTitle] = useState("");
  // One right-hand panel at a time (Title page/Page setup/Revisions/AI/Snapshots — unrelated to the
  // sidebar's own master/detail selection below, which owns the main content area instead).
  const [panel, setPanel] = useState<"snapshots" | "ai" | "title" | "setup" | "revisions" | null>(null);
  const togglePanel = (p: "snapshots" | "ai" | "title" | "setup" | "revisions") => setPanel(cur => (cur === p ? null : p));
  const [rebased, setRebased] = useState<RebasedEvent | null>(null);
  const [view, setViewRaw] = useState<View>("edit");
  const [printPending, setPrintPending] = useState(false);
  const [caret, setCaret] = useState<PlainPos | null>(null);
  // The sidebar's Catalog selection: when set, `MasterDetailLayout`'s detail area shows that entity
  // (`EntityDetailView`) instead of the script editor — a real master/detail relationship, not a toggle.
  // `selectedStageId` additionally picks one of a `character`-kind entity's life stages (see
  // `util/character-skeleton.ts`) instead of the character itself; `null` when none is selected, or the
  // selected entity has no stages / isn't a character.
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);
  const [selectedStageId, setSelectedStageId] = useState<string | null>(null);
  const selectEntity = (entityId: string | null, stageId: string | null = null) => {
    setSelectedEntityId(entityId);
    setSelectedStageId(entityId ? stageId : null);
  };
  // Revised pages list: switch to the Pages tab and scroll to that sheet once it is on screen.
  const [goPage, setGoPage] = useState<{ index: number } | null>(null);
  // Switching tabs by hand drops any pending "put the caret here" so Edit does not jump back to an old jump target.
  const setView = (v: View) => {
    selectEntity(null); // choosing a view goes back to the script, out of any Catalog item
    setCaret(null);
    setViewRaw(v);
  };
  // Navigator click / card double-click: Edit view, caret at the scene heading, scrolled into view
  // (ScriptEditor initialCaret). A fresh object each time so jumping to the same scene twice still
  // re-applies the caret. Also clears any Catalog selection, so the detail area snaps back to the script.
  const jumpTo = (elementId: string) => {
    selectEntity(null);
    setCaret({ elementId, offset: 0 });
    setViewRaw("edit");
  };
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

  useEffect(() => {
    if (!goPage || view !== "pages" || layout.status === "loading") return;
    const sheet = document.querySelector<HTMLElement>(`.wui-sheet[data-page="${goPage.index + 1}"]`);
    if (!sheet) return;
    sheet.scrollIntoView({ block: "start" });
    sheet.setAttribute("data-jumped", "1");
    setGoPage(null);
  }, [goPage, view, layout.status, layout.pageCount]);

  // What is printed is never the screen's layout: while printing, the sheets are rendered on their own, straight
  // under <body> (`print-sheets`), and the app is hidden. The screen layout cannot be trusted on paper: the
  // master/detail layout goes "mobile" below 768px and hides the script, and a printed page is narrower than that
  // as soon as the browser adds its own margins (Safari does by default), which printed blank pages.
  const [printing, setPrinting] = useState(false);
  useEffect(() => {
    // `beforeprint` also fires for the browser's own Print command; the sheets must be in the DOM before it returns.
    // Not while a Catalog item is being printed on its own (`util/print-item.ts`): that is not the script.
    const before = () => !document.body.classList.contains("printing-doc") && flushSync(() => setPrinting(true));
    const after = () => setPrinting(false);
    window.addEventListener("beforeprint", before);
    window.addEventListener("afterprint", after);
    // Not every way of printing sends `beforeprint` (saving a PDF without a dialog does not): the print medium
    // coming into force is the second signal, the same kind the layout itself reacts to.
    const medium = typeof window.matchMedia === "function" ? window.matchMedia("print") : null;
    const onMedium = (e: MediaQueryListEvent) => (e.matches ? before() : after());
    medium?.addEventListener?.("change", onMedium);
    return () => {
      window.removeEventListener("beforeprint", before);
      window.removeEventListener("afterprint", after);
      medium?.removeEventListener?.("change", onMedium);
    };
  }, []);
  // Only while printing: a second copy of the pages kept around would double the page view's DOM (and its test ids).
  const printable = printing && !!host && layout.status === "ready";
  useEffect(() => {
    document.body.classList.toggle("printing-sheets", printable);
    return () => document.body.classList.remove("printing-sheets");
  }, [printable]);

  // "PDF (print)": switch to Pages, wait for the layout, put the sheets up, then open the print dialog.
  useEffect(() => {
    if (!printPending || view !== "pages" || layout.status !== "ready") return;
    setPrinting(true);
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
  // The script toolbar: the Edit | Pages | Cards switch, the tools that only make sense with the script editor
  // (Edit view's style picker/dual dialogue/scene omit, Pages view's Print), and the script's page facts on the
  // right (page count, Title page, Page setup). It stays visible while the sidebar's Catalog selection replaces
  // the content area with `EntityDetailView`: the script-only tools grey out (none of them act on an entity),
  // choosing a view returns to the script, and the panel buttons keep working (their panels sit beside the content).
  const scriptActive = !selectedEntityId;

  return (
    <div className="h-full flex flex-col print-flow">
      {printable &&
        createPortal(
          <div className="print-sheets" data-testid="print-sheets">
            <PageView host={host!} layout={layout} />
          </div>,
          document.body
        )}
      <header className="bg-white border-b border-neutral-200 px-4 py-2 flex items-center gap-x-3 gap-y-1 flex-wrap print:hidden">
        <Link
          to={projectId ? `/${lang}/p/${projectId}` : `/${lang}`}
          className="inline-flex items-center gap-1 text-sm text-neutral-600 hover:underline"
        >
          <ChevronLeftIcon className="size-[18px] shrink-0" />
          {projectId ? "Project" : "Home"}
        </Link>
        <input
          spellCheck={true}
          autoCorrect="off"
          aria-label="Document title"
          value={title}
          onChange={e => setTitle(e.target.value)}
          onBlur={() => void saveTitle()}
          onKeyDown={e => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
          className="font-semibold text-lg border border-transparent hover:border-neutral-300 focus:border-neutral-400 rounded px-2 py-0.5 min-w-48"
        />
        <span className="ml-auto" />
        {host && <RevisionIndicator host={host} onClick={() => setPanel("revisions")} />}
        {ready && (
          <ExportMenu
            documentId={documentId}
            onPrint={() => {
              setView("pages");
              setPrintPending(true);
            }}
          />
        )}
        <span className="flex items-center gap-2 text-sm" data-testid="sync-status" data-state={st.label.toLowerCase()}>
          <span className={`inline-block w-2.5 h-2.5 rounded-full ${st.tone}`} />
          {st.label}
        </span>
        <button
          onClick={() => togglePanel("revisions")}
          aria-pressed={panel === "revisions"}
          data-testid="revisions-button"
          className={`border border-neutral-300 rounded px-3 py-1 text-sm ${panel === "revisions" ? "bg-neutral-800 text-white" : "hover:bg-neutral-100"}`}
        >
          Revisions
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

      <div
        data-testid="editing-bar"
        data-script-active={scriptActive}
        className="bg-white border-b border-neutral-200 px-4 py-2 flex items-center gap-3 flex-wrap print:hidden"
      >
        <div role="tablist" aria-label="View" className="inline-flex rounded border border-neutral-300 overflow-hidden text-sm">
          {(["edit", "pages", "cards"] as const).map(v => (
            <button
              key={v}
              role="tab"
              aria-selected={scriptActive && view === v}
              data-testid={`view-${v}`}
              onClick={() => setView(v)}
              className={`px-3 py-1 ${scriptActive && view === v ? "bg-neutral-800 text-white" : "bg-white hover:bg-neutral-100"}`}
            >
              {VIEW_LABEL[v]}
            </button>
          ))}
        </div>
        {/* The script-only tools grey out (and stop taking input) while a Catalog item replaces the script in the content area. */}
        <div className={`flex items-center gap-3 flex-wrap ${scriptActive ? "" : "opacity-40 pointer-events-none"}`} inert={!scriptActive}>
          {host && view === "edit" && <ElementStylePicker host={host} className="border border-neutral-300 rounded px-2 py-1 text-sm" />}
          {host && view === "edit" && <DualDialogueToggle host={host} />}
          {host && view === "edit" && <SceneOmitToggle host={host} />}
          {host && view === "edit" && <FixFormattingButton host={host} />}
          {host && view === "edit" && <TechniqueMenu host={host} onInserted={jumpTo} />}
          {view === "pages" && (
            <button onClick={() => setPrintPending(true)} data-testid="print-button" className="border border-neutral-300 rounded px-3 py-1 text-sm hover:bg-neutral-100">
              Print / Save as PDF
            </button>
          )}
        </div>
        <span className="ml-auto" />
        <span className="text-sm text-neutral-600" data-testid="page-count" data-pages={layout.pageCount} data-status={layout.status}>
          {pageLabel}
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
      </div>

      <div className="flex-1 min-h-0 flex print-flow" data-testid="editor-split">
        {host && (
          <MasterDetailLayout
            masterContent={
              <EditorSidebar
                host={host}
                selectedEntityId={selectedEntityId}
                selectedStageId={selectedStageId}
                onSelectEntity={selectEntity}
                onJumpToScene={jumpTo}
              />
            }
            // No width cap: the script editor/pages content has never had one, and 1024px (the
            // component's own default) would newly constrain it on wide screens.
            detailMaxWidth={0}
            detailContent={
              selectedEntityId ? (
                <EntityDetailView
                  host={host}
                  entityId={selectedEntityId}
                  stageId={selectedStageId}
                  onJumpTo={jumpTo}
                  onSelectStage={stageId => setSelectedStageId(stageId)}
                  onDeleted={() => selectEntity(null)}
                  scriptTitle={title}
                />
              ) : (
                <>
                  {error && <p className="p-6 text-red-600">Could not open the document: {error.message}</p>}
                  {!error && !ready && <p className="p-6 text-neutral-500">Opening document...</p>}
                  {view === "edit" && <ScriptEditor host={host} initialCaret={caret} />}
                  {view === "cards" && <IndexCards host={host} onOpenScene={jumpTo} />}
                  {view === "pages" && (
                    <PageView
                      host={host}
                      layout={layout}
                      onRequestEdit={(elementId, offset) => {
                        setCaret({ elementId, offset });
                        setViewRaw("edit");
                      }}
                    />
                  )}
                </>
              )
            }
          />
        )}
        {!host && (error || !ready) && (
          <main className="flex-1 min-w-0 print-flow">
            {error && <p className="p-6 text-red-600">Could not open the document: {error.message}</p>}
            {!error && !ready && <p className="p-6 text-neutral-500">Opening document...</p>}
          </main>
        )}
        {panel === "snapshots" && session && (
          <SnapshotsPanel session={session} onClose={() => setPanel(null)} onForked={id => navigate(`/${lang}/d/${id}`)} rebasedTick={rebased} />
        )}
        {panel === "title" && host && <TitlePagePanel host={host} onClose={() => setPanel(null)} />}
        {panel === "setup" && host && <PageSetupPanel host={host} onClose={() => setPanel(null)} />}
        {panel === "revisions" && host && (
          <RevisionsPanel
            host={host}
            layout={layout.layout}
            onClose={() => setPanel(null)}
            onGoToPage={index => {
              setCaret(null);
              setViewRaw("pages");
              setGoPage({ index });
            }}
          />
        )}
        {panel === "ai" && host && <AiPanel documentId={documentId} host={host} onJumpTo={jumpTo} onClose={() => setPanel(null)} />}
      </div>
    </div>
  );
}
