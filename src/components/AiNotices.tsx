import type { AiActions } from "../hooks/useAiActions";

const btn = "border border-neutral-300 rounded px-2 py-1 text-xs hover:bg-neutral-100 disabled:opacity-50";
const primary = "bg-neutral-900 text-white rounded px-3 py-1 text-sm hover:bg-neutral-800 disabled:opacity-50";

/**
 * The status lines every AI action UI shows the same way: test-mode banner, "not configured", the consent
 * notice (the API refuses an action until the user has accepted it), the last error, and the credit balance.
 * `showTestBanner={false}` where the surrounding panel already shows its own (the AI panel does).
 */
export function AiNotices({ ai, showCredits = false, showTestBanner = true }: { ai: AiActions; showCredits?: boolean; showTestBanner?: boolean }) {
  return (
    <div className="space-y-2" data-testid="ai-notices">
      {showTestBanner && ai.mode === "fixture" && (
        <div role="note" data-testid="ai-action-test-banner" className="bg-amber-100 border border-amber-400 rounded p-2 text-xs font-medium text-amber-900">
          Test mode — these results are canned samples, not real AI output
        </div>
      )}
      {ai.loaded && !ai.available && (
        <p data-testid="ai-action-unavailable" className="text-xs text-neutral-600">
          AI is not configured on this server, so this is unavailable.
        </p>
      )}
      {ai.needsConsent && (
        <div role="alertdialog" aria-label="AI consent" data-testid="ai-consent" className="border border-neutral-300 rounded p-3 bg-white text-sm space-y-2">
          <p className="font-medium">Use AI on your writing?</p>
          <p className="text-xs text-neutral-600">
            To do this, the text or image you choose (a description, selected visual look, story, or script excerpt) is sent to an AI provider, which returns the result.
            Nothing is applied to your script until you accept it.
          </p>
          <div className="flex gap-2">
            <button className={primary} data-testid="ai-consent-accept" onClick={() => void ai.acceptConsent()}>
              I agree
            </button>
            <button className={btn} data-testid="ai-consent-decline" onClick={ai.declineConsent}>
              Not now
            </button>
          </div>
        </div>
      )}
      {ai.error && (
        <div role="alert" data-testid="ai-action-error" data-code={ai.error.code} className="bg-red-50 border border-red-300 rounded p-2 text-xs text-red-800 flex gap-2">
          <span>{ai.error.message}</span>
          <button className="ml-auto underline" onClick={ai.clearError}>
            Dismiss
          </button>
        </div>
      )}
      {showCredits && ai.credits !== null && (
        <p className="text-[11px] text-neutral-500" data-testid="ai-credits">
          Credits: {ai.credits}
        </p>
      )}
    </div>
  );
}
