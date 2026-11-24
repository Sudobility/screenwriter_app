import { useEffect, useMemo, useRef } from "react";
import { createNavStore, SlidePanel, SlidingPanel, type NavStore, type ScreenEntry } from "@sudobility/building_blocks";
import { useEditorSelection, type ScriptEditorHost } from "@sudobility/writing_ui";
import { useAi } from "@sudobility/screenwriter_lib";
import { useAcceptAiConsent, useAiConsent } from "@sudobility/screenwriter_client";
import { useModelTick } from "../../util/use-model-tick";
import { actionById, type AiAction } from "./actions";
import { AiListScreen } from "./AiListScreen";
import { btn, primary, type AiWizardCtx } from "./shared";

interface Props {
  documentId: string;
  host: ScriptEditorHost;
  onJumpTo(sceneId: string): void;
  /** Whether the wizard drawer is open. Kept mounted when closed so the stack survives. */
  open: boolean;
  onClose(): void;
}

const ROOT: ScreenEntry[] = [{ id: "list", key: "list", nav: { title: "AI" } }];

/** A screen body's padding/spacing wrapper. */
function Pad({ children }: { children: React.ReactNode }) {
  return <div className="p-3 space-y-3">{children}</div>;
}

/**
 * The panel-global banners: the test-mode notice and the shared AI error / consent prompt. Rendered
 * ONCE, above the screen stack — not per screen — because SlidingPanel keeps lower screens mounted,
 * so a per-screen copy would duplicate these (and their test ids).
 */
function AiBanners({ ctx }: { ctx: AiWizardCtx }) {
  const { ai } = ctx;
  const consent = useAiConsent();
  const acceptConsent = useAcceptAiConsent();
  const mode = ai.status?.mode;
  const consentNeeded = ai.error?.code === "AI_CONSENT_REQUIRED";
  const otherError = ai.error && ai.error.code !== "AI_CONSENT_REQUIRED";
  if (mode !== "fixture" && !consentNeeded && !otherError) return null;
  return (
    <div className="p-3 pb-0 space-y-3">
      {mode === "fixture" && (
        <div role="note" data-testid="ai-test-banner" className="bg-amber-100 border border-amber-400 rounded p-2 text-sm font-medium text-amber-900">
          Test mode — these results are canned samples, not real AI output
        </div>
      )}
      {consentNeeded && (
        <div role="alertdialog" aria-label="AI consent" data-testid="ai-panel-consent" className="border border-neutral-300 rounded p-3 bg-white text-sm space-y-2">
          <p className="font-medium">Use AI on your writing?</p>
          <p className="text-xs text-neutral-600">
            To review or polish, the script text is sent to an AI provider, which returns notes or suggestions. Nothing changes until you accept a suggestion.
          </p>
          <div className="flex gap-2">
            <button
              className={primary}
              data-testid="ai-panel-consent-accept"
              disabled={acceptConsent.isPending || !consent.data}
              onClick={async () => {
                if (!consent.data) return;
                await acceptConsent.mutateAsync({ version: consent.data.currentVersion });
                ai.clearError();
              }}
            >
              I agree
            </button>
            <button className={btn} onClick={ai.clearError}>
              Not now
            </button>
          </div>
        </div>
      )}
      {otherError && (
        <div role="alert" data-testid="ai-error" data-code={ai.error!.code} className="bg-red-50 border border-red-300 rounded p-2 text-sm text-red-800 flex gap-2">
          <span>{ai.error!.message}</span>
          <button className="ml-auto underline text-xs" onClick={ai.clearError}>
            Dismiss
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * The AI panel as a wizard: screen 1 is a searchable, grouped list of actions; selecting one pushes
 * its screen, which holds that action's options, the execute button, and its results/suggestions.
 * Rendered as a drawer — a right-hand side panel on desktop, full-screen on mobile.
 */
export function AiWizard({ documentId, host, onJumpTo, open, onClose }: Props) {
  const ai = useAi(documentId);
  useModelTick(host);
  const selection = useEditorSelection(host);
  const scene = useMemo(() => {
    const id = selection?.head.elementId;
    const s = id ? host.model.sceneOf(id as never) : null;
    return s ? { id: String(s.id), heading: s.headingText } : null;
  }, [host, selection]);

  const storeRef = useRef<NavStore | null>(null);
  if (!storeRef.current) storeRef.current = createNavStore(ROOT);
  const store = storeRef.current;

  // Opening the panel returns to the action list.
  const prevOpen = useRef(open);
  useEffect(() => {
    if (open && !prevOpen.current) store.getState().reset(ROOT);
    prevOpen.current = open;
  }, [open, store]);

  const ctx: AiWizardCtx = { documentId, host, ai, scene, onJumpTo, store };

  const usable = ai.status?.available === true;

  const openAction = (a: AiAction) => store.getState().push({ key: "options", nav: { title: a.title }, params: { actionId: a.id } });

  const screens = {
    list: () => (
      <Pad>
        {!ai.loaded ? (
          <p className="text-xs text-neutral-500">Checking whether AI is available...</p>
        ) : !usable ? (
          <div data-testid="ai-unavailable" className="border border-neutral-300 rounded p-3 bg-white text-sm space-y-1">
            <p className="font-medium">AI is not configured on this server.</p>
            <p className="text-xs text-neutral-600">Review and polish need an AI provider. Ask whoever runs the server to set it up, then reopen this panel.</p>
          </div>
        ) : (
          <AiListScreen onOpen={openAction} />
        )}
      </Pad>
    ),
    options: (entry: ScreenEntry) => {
      const { actionId } = (entry.params ?? {}) as { actionId?: string };
      const action = actionId ? actionById(actionId) : undefined;
      return <Pad>{action ? <action.Options ctx={ctx} /> : <p className="text-xs text-neutral-500">Unknown action.</p>}</Pad>;
    },
  };

  // The drawer: full-screen on phones, a right-hand side panel on `sm`+ (the "full screen on mobile"
  // behaviour, the web counterpart of building_blocks_rn's ResponsivePanel). SlidePanel owns the
  // slide + mount/unmount so the panel leaves the DOM when closed (one right-hand panel at a time);
  // the SlidingPanel inside is the wizard's screen stack + nav bar.
  return (
    <SlidePanel open={open} slideFrom="right" className="absolute inset-0 sm:inset-y-0 sm:left-auto sm:right-0 sm:w-96 z-20">
      <div data-testid="ai-panel" aria-label="AI" className="h-full w-full flex flex-col overflow-hidden bg-neutral-50">
        <AiBanners ctx={ctx} />
        <div className="min-h-0 flex-1">
          <SlidingPanel
            store={store}
            screens={screens}
            renderActions={() => (
              <button type="button" className={btn} data-testid="ai-close" onClick={onClose}>
                Close
              </button>
            )}
          />
        </div>
      </div>
    </SlidePanel>
  );
}
