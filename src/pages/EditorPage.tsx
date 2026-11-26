import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal, flushSync } from "react-dom";
import { Link, useNavigate, useParams } from "react-router-dom";
import { CameraIcon, ChatBubbleLeftRightIcon, ChevronLeftIcon, ClockIcon, Cog6ToothIcon, DocumentTextIcon, MagnifyingGlassIcon, PrinterIcon, SparklesIcon } from "@heroicons/react/24/outline";
import { MasterDetailLayout, Tooltip } from "@sudobility/components";
import { useLang } from "../hooks/useLang";
import { getSelectionStore, IndexCards, PageView, ScriptEditor, useLayout, type PlainPos } from "@sudobility/writing_ui";
import { StylePicker } from "../components/StylePicker";
import { SlidePanel } from "@sudobility/building_blocks";
import { PanelFrame } from "../components/shell/PanelFrame";
import { IconButton } from "../components/shell/IconButton";
import { useDocumentSession, useScreenwriter, type RebasedEvent, type SessionSyncStatus } from "@sudobility/screenwriter_lib";
import { useMembers } from "@sudobility/screenwriter_client";
import { DEV_AUTH } from "../config";
import { sessionToHost } from "../adapter/session-host";
import { RevisionIndicator, RevisionsPanel } from "../components/RevisionsPanel";
import { AiWizardBody } from "../components/ai/AiWizard";
import { CommentsPanel } from "../components/CommentsPanel";
import { DualDialogueToggle } from "../components/DualDialogueToggle";
import { FixFormattingButton } from "../components/FixFormattingButton";
import { TechniqueMenu } from "../components/TechniqueMenu";
import { SceneOmitToggle } from "../components/SceneOmitToggle";
import { GenerateStoryboardButton } from "../components/GenerateStoryboardButton";
import { PageSetupPanel } from "../components/PageSetupPanel";
import { FindReplaceBar } from "../components/FindReplaceBar";
import { createProviders } from "../util/search/providers";
import { TitlePagePanel } from "../components/TitlePagePanel";
import { SnapshotsPanel } from "../components/SnapshotsPanel";
import { ExportMenu } from "../components/ExportMenu";
import { EditorSidebar } from "../components/EditorSidebar";
import { useStoryboardThumbnails } from "../util/use-storyboard-thumbnails";
import { StoryboardDetail } from "../components/StoryboardDetail";
import { EntityDetailView } from "../components/EntityDetailView";

type View = "edit" | "pages" | "cards";
const VIEW_LABEL: Record<View, string> = { edit: "Edit", pages: "Pages", cards: "Cards" };

/** A top-bar button that opens a right-hand panel, shown as an icon with an accessible label + tooltip. */
function PanelIconButton({
  icon: Icon,
  label,
  active,
  onClick,
  testId,
}: {
  icon: typeof SparklesIcon;
  label: string;
  active: boolean;
  onClick(): void;
  testId?: string;
}) {
  return (
    <Tooltip content={label} placement="bottom" delayShow={150}>
      <button
        type="button"
        onClick={onClick}
        aria-pressed={active}
        aria-label={label}
        data-testid={testId}
        className={`inline-flex h-9 w-9 items-center justify-center rounded border border-neutral-300 ${active ? "bg-neutral-800 text-white" : "hover:bg-neutral-100"}`}
      >
        <Icon className="h-5 w-5" aria-hidden="true" />
      </button>
    </Tooltip>
  );
}

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
  // Only the writer (owner/manager) triages comments; members add/reply only. Author names come from the
  // workspace members so comments show people, not uids.
  const sessionRole = session?.detail?.role;
  const canTriageComments = sessionRole === "owner" || sessionRole === "manager";
  const membersQuery = useMembers(session?.detail?.entityId ?? undefined);
  const commentAuthorName = useCallback(
    (uid: string) => {
      const m = membersQuery.data?.data?.find((x) => x.userId === uid);
      return m?.displayName ?? m?.email ?? uid;
    },
    [membersQuery.data],
  );
  const [title, setTitle] = useState("");
  // One right-hand panel at a time (Title page/Page setup/Revisions/AI/Snapshots — unrelated to the
  // sidebar's own master/detail selection below, which owns the main content area instead).
  const [panel, setPanel] = useState<"snapshots" | "ai" | "title" | "setup" | "revisions" | "comments" | null>(null);
  const togglePanel = (p: "snapshots" | "ai" | "title" | "setup" | "revisions" | "comments") => setPanel(cur => (cur === p ? null : p));
  const [rebased, setRebased] = useState<RebasedEvent | null>(null);
  const [view, setViewRaw] = useState<View>("edit");
  const [printPending, setPrintPending] = useState(false);
  const [caret, setCaret] = useState<PlainPos | null>(null);
  const [findOpen, setFindOpen] = useState(false);
  // The sidebar's Catalog selection: when set, `MasterDetailLayout`'s detail area shows that entity
  // (`EntityDetailView`) instead of the script editor — a real master/detail relationship, not a toggle.
  // `selectedStageId` additionally picks one of a `character`-kind entity's life stages (see
  // `util/character-skeleton.ts`) instead of the character itself; `null` when none is selected, or the
  // selected entity has no stages / isn't a character.
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);
  const [selectedStageId, setSelectedStageId] = useState<string | null>(null);
  const [selectedStoryboardSceneId, setSelectedStoryboardSceneId] = useState<string | null>(null);
  const selectEntity = (entityId: string | null, stageId: string | null = null) => {
    setSelectedStoryboardSceneId(null);
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
  // Right-margin storyboard thumbnails in the script editor: one per scene that has a storyboard, linking to it.
  const storyboardThumbs = useStoryboardThumbnails(host, documentId);

  // Project-wide Find & Replace: each surface (title page, script, Catalog entities) is one provider that knows
  // how to navigate to, highlight and replace its own matches.
  const showScript = useCallback(() => {
    setSelectedStoryboardSceneId(null);
    setSelectedEntityId(null);
    setSelectedStageId(null);
    setViewRaw("edit");
  }, []);
  const showEntity = useCallback((entityId: string, stageOrKey: string | null) => {
    setSelectedStoryboardSceneId(null);
    setSelectedEntityId(entityId);
    setSelectedStageId(stageOrKey);
  }, []);
  const showStoryboard = useCallback((sceneId: string) => {
    setSelectedEntityId(null);
    setSelectedStageId(null);
    setSelectedStoryboardSceneId(sceneId);
  }, []);
  // From the AI panel's "View storyboard" link: show the storyboard and close the AI drawer so it's in view.
  const viewStoryboard = useCallback((sceneId: string) => {
    showStoryboard(sceneId);
    setPanel(null);
  }, [showStoryboard]);
  const openTitlePanel = useCallback(() => setPanel("title"), []);
  const findNav = useMemo(() => ({ showScript, showEntity, showStoryboard, openTitlePanel }), [showScript, showEntity, showStoryboard, openTitlePanel]);
  const searchProviders = useMemo(() => (host ? createProviders(host, findNav) : []), [host, findNav]);

  // Cmd/Ctrl+F opens the find bar (overriding the browser's own find). It does not change the current view or
  // selection — the first Find Next navigates to wherever the match is. While already open, the bar itself
  // handles Cmd/Ctrl+F (refocus) and Cmd/Ctrl+G / F3 (step), so this only opens it.
  const findOpenRef = useRef(false);
  findOpenRef.current = findOpen;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey || e.key.toLowerCase() !== "f" || findOpenRef.current) return;
      e.preventDefault();
      setFindOpen(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

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

  const closePanel = () => setPanel(null);

  // One right-hand drawer, animated sequentially. `panel` is the target (from the toolbar); `displayedPanel`
  // is what's mounted in the drawer. `panelOpen` is DERIVED (shown only when the mounted panel is the target),
  // so switching panels first slides the current one OUT (open=false while they differ), then — once it has
  // slid away (the timeout below, matching SlidePanel's 300ms) — swaps `displayedPanel` to the target and
  // slides it IN. Deriving `open` makes a rapid re-select of the same panel self-correct: the pending swap is
  // cancelled and `open` returns true, so the drawer never desyncs from the button.
  const PANEL_SLIDE_MS = 300;
  type PanelId = typeof panel;
  const [displayedPanel, setDisplayedPanel] = useState<PanelId>(panel);
  const panelOpen = panel !== null && panel === displayedPanel;
  useEffect(() => {
    if (panel === displayedPanel) return;
    if (displayedPanel === null) {
      setDisplayedPanel(panel); // nothing shown → mount the target (it slides in)
      return;
    }
    // A different panel is shown → let it slide out, then swap. Re-selecting cancels this.
    const t = window.setTimeout(() => setDisplayedPanel(panel), PANEL_SLIDE_MS);
    return () => window.clearTimeout(t);
  }, [panel, displayedPanel]);

  // Off the script (a Catalog entity or a storyboard is in the detail), only AI is reachable — the other
  // panels are document/script-level and their openers live in the script toolbar. Close any of those if it
  // was open on the script when the writer moves off it, so the drawer never lingers with no way to close it.
  const offScript = selectedEntityId !== null || selectedStoryboardSceneId !== null;
  useEffect(() => {
    if (offScript && panel !== null && panel !== "ai") setPanel(null);
  }, [offScript, panel]);

  // The entity / storyboard detail, wrapped with a minimal toolbar that carries the AI opener and the same AI
  // wizard drawer over the detail — so AI assists (e.g. smart-paste into a character) work off the script too.
  const renderOffScript = (children: ReactNode) => (
    <div className="relative h-full min-h-0 flex flex-col">
      <div data-testid="detail-bar" className="shrink-0 bg-white border-b border-neutral-200 px-4 py-2 flex items-center justify-end print:hidden">
        <PanelIconButton icon={SparklesIcon} label="AI" active={panel === "ai"} onClick={() => togglePanel("ai")} testId="ai-button" />
      </div>
      <div className="relative flex-1 min-h-0 overflow-hidden">
        {children}
        <SlidePanel open={panelOpen} slideFrom="right" slideMs={PANEL_SLIDE_MS} className="absolute inset-0 sm:inset-y-0 sm:left-auto sm:right-0 sm:w-96 z-20">
          {displayedPanel === "ai" && host && <AiWizardBody documentId={documentId} host={host} onJumpTo={jumpTo} onViewStoryboard={viewStoryboard} onClose={closePanel} />}
        </SlidePanel>
      </div>
    </div>
  );

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

      <div className="relative flex-1 min-h-0 flex overflow-hidden print-flow" data-testid="editor-split">
        {host && (
          <MasterDetailLayout
            masterContent={
              <EditorSidebar
                host={host}
                selectedEntityId={selectedEntityId}
                selectedStageId={selectedStageId}
                onSelectEntity={selectEntity}
                onJumpToScene={jumpTo}
                onShowScript={showScript}
                selectedStoryboardSceneId={selectedStoryboardSceneId}
                onSelectStoryboard={sceneId => { setSelectedEntityId(null); setSelectedStageId(null); setSelectedStoryboardSceneId(sceneId); }}
              />
            }
            // No width cap: the script editor/pages content has never had one, and 1024px (the
            // component's own default) would newly constrain it on wide screens.
            detailMaxWidth={0}
            detailContent={
              selectedStoryboardSceneId && projectId ? (
                renderOffScript(<StoryboardDetail host={host} documentId={documentId} projectId={projectId} sceneId={selectedStoryboardSceneId} onDeleted={() => setSelectedStoryboardSceneId(null)} onJumpTo={jumpTo} />)
              ) : selectedEntityId ? (
                renderOffScript(
                  <EntityDetailView
                    host={host}
                    documentId={documentId}
                    projectId={projectId ?? ""}
                    entityId={selectedEntityId}
                    stageId={selectedStageId}
                    onJumpTo={jumpTo}
                    onSelectStage={stageId => setSelectedStageId(stageId)}
                    onDeleted={() => selectEntity(null)}
                    scriptTitle={title}
                  />,
                )
              ) : (
                // The script editor and its OWN toolbar: the view tabs + editing tools live above the editor,
                // inside the content area, because they act only on the script (not on a Catalog item).
                <div className="flex h-full min-h-0 flex-col">
                  <div data-testid="editing-bar" data-script-active="true" className="shrink-0 bg-white border-b border-neutral-200 px-4 py-2 flex items-center gap-2 flex-wrap print:hidden">
                    <div role="tablist" aria-label="View" className="inline-flex h-9 rounded border border-neutral-300 overflow-hidden text-sm">
                      {(["edit", "pages", "cards"] as const).map(v => (
                        <button
                          key={v}
                          role="tab"
                          aria-selected={view === v}
                          data-testid={`view-${v}`}
                          onClick={() => setView(v)}
                          className={`inline-flex items-center px-3 ${view === v ? "bg-neutral-800 text-white" : "bg-white hover:bg-neutral-100"}`}
                        >
                          {VIEW_LABEL[v]}
                        </button>
                      ))}
                    </div>
                    {view === "edit" && <StylePicker host={host} />}
                    {view === "edit" && <DualDialogueToggle host={host} />}
                    {view === "edit" && <SceneOmitToggle host={host} />}
                    {view === "edit" && <GenerateStoryboardButton host={host} documentId={documentId} onGenerated={id => setSelectedStoryboardSceneId(id)} />}
                    {view === "edit" && <FixFormattingButton host={host} iconOnly />}
                    {view === "edit" && <TechniqueMenu host={host} onInserted={jumpTo} />}
                    {view === "edit" && (
                      <IconButton
                        icon={MagnifyingGlassIcon}
                        label="Find & replace (⌘F)"
                        active={findOpen}
                        onClick={() => setFindOpen(o => !o)}
                        testId="find-button"
                      />
                    )}
                    {view === "pages" && (
                      <IconButton icon={PrinterIcon} label="Print / Save as PDF" onClick={() => setPrintPending(true)} testId="print-button" />
                    )}
                    {/* Script/document panel openers (open side panels over the editor view below this toolbar). */}
                    <span className="mx-1 h-6 w-px bg-neutral-200" aria-hidden />
                    <PanelIconButton icon={ClockIcon} label="Revisions" active={panel === "revisions"} onClick={() => togglePanel("revisions")} testId="revisions-button" />
                    <PanelIconButton icon={SparklesIcon} label="AI" active={panel === "ai"} onClick={() => togglePanel("ai")} testId="ai-button" />
                    <PanelIconButton icon={ChatBubbleLeftRightIcon} label="Comments" active={panel === "comments"} onClick={() => togglePanel("comments")} testId="comments-button" />
                    <PanelIconButton icon={CameraIcon} label="Snapshots" active={panel === "snapshots"} onClick={() => togglePanel("snapshots")} />
                    <PanelIconButton icon={DocumentTextIcon} label="Title page" active={panel === "title"} onClick={() => togglePanel("title")} testId="title-button" />
                    <PanelIconButton icon={Cog6ToothIcon} label="Page setup" active={panel === "setup"} onClick={() => togglePanel("setup")} testId="setup-button" />
                    {/* Page count — always the last item. */}
                    <span className="text-sm text-neutral-600" data-testid="page-count" data-pages={layout.pageCount} data-status={layout.status}>
                      {pageLabel}
                    </span>
                  </div>
                  <div className="relative flex-1 min-h-0 flex flex-col overflow-hidden print-flow">
                    {error && <p className="p-6 text-red-600">Could not open the document: {error.message}</p>}
                    {!error && !ready && <p className="p-6 text-neutral-500">Opening document...</p>}
                    {view === "edit" && (
                      <ScriptEditor
                        host={host}
                        initialCaret={caret}
                        onOpenComments={() => setPanel("comments")}
                        sceneThumbnails={storyboardThumbs}
                        onOpenSceneThumbnail={showStoryboard}
                      />
                    )}
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
                    {/* The ONE right-hand drawer — overlays only the editor VIEW (below the toolbar), so the
                        toolbar's panel buttons above it stay visible to toggle it. Full-screen on mobile, side
                        panel on desktop. `displayedPanel`/`panelOpen` sequence the slide (old out, then new in). */}
                    <SlidePanel
                      open={panelOpen}
                      slideFrom="right"
                      slideMs={PANEL_SLIDE_MS}
                      className="absolute inset-0 sm:inset-y-0 sm:left-auto sm:right-0 sm:w-96 z-20"
                    >
                      {displayedPanel === "snapshots" && session && (
                        <PanelFrame title="Snapshots" testId="snapshots-panel" onClose={closePanel}>
                          <SnapshotsPanel session={session} onForked={id => navigate(`/${lang}/d/${id}`)} rebasedTick={rebased} />
                        </PanelFrame>
                      )}
                      {displayedPanel === "title" && host && (
                        <PanelFrame title="Title page" testId="title-panel" bodyClassName="p-3 space-y-3" onClose={closePanel}>
                          <TitlePagePanel host={host} />
                        </PanelFrame>
                      )}
                      {displayedPanel === "setup" && host && (
                        <PanelFrame title="Page setup" testId="setup-panel" onClose={closePanel}>
                          <PageSetupPanel host={host} />
                        </PanelFrame>
                      )}
                      {displayedPanel === "revisions" && host && (
                        <PanelFrame title="Revisions" testId="revisions-panel" onClose={closePanel}>
                          <RevisionsPanel
                            host={host}
                            layout={layout.layout}
                            onGoToPage={index => {
                              setCaret(null);
                              setViewRaw("pages");
                              setGoPage({ index });
                            }}
                          />
                        </PanelFrame>
                      )}
                      {displayedPanel === "comments" && host && (
                        <PanelFrame title="Comments" testId="comments-panel" bodyClassName="p-3 space-y-3 text-sm" onClose={closePanel}>
                          <CommentsPanel host={host} onJumpTo={jumpTo} canTriage={canTriageComments} authorName={commentAuthorName} />
                        </PanelFrame>
                      )}
                      {displayedPanel === "ai" && host && <AiWizardBody documentId={documentId} host={host} onJumpTo={jumpTo} onViewStoryboard={viewStoryboard} onClose={closePanel} />}
                    </SlidePanel>
                  </div>
                </div>
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
        {host && findOpen && (
          <FindReplaceBar
            host={host}
            providers={searchProviders}
            onClose={() => {
              setFindOpen(false);
              getSelectionStore(host).focusEditor?.();
            }}
          />
        )}
      </div>
    </div>
  );
}
