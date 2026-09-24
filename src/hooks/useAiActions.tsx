import { useCallback, useRef, useState } from "react";
import {
  isApiError,
  useAcceptAiConsent,
  useAiConsent,
  useAiStatus,
  useCreditsBalance,
  type ScreenwriterClient,
} from "@sudobility/screenwriter_client";
import { useScreenwriter } from "@sudobility/screenwriter_lib";
import type { AiActionResponse } from "@sudobility/screenwriter_types";

const MESSAGES: Record<string, string> = {
  INSUFFICIENT_CREDITS: "You don't have enough credits for this. Nothing was charged.",
  RATE_LIMITED: "You have reached today's AI limit. Please try again tomorrow.",
  AI_UNAVAILABLE: "AI is not available right now. Please try again later.",
  AI_OUTPUT_INVALID: "The AI's answer could not be used, so nothing was changed or charged. Please try again.",
  AI_GENERATION_FAILED: "The AI service failed to answer. Nothing was charged. Please try again.",
  AI_CONTENT_REFUSED: "The AI declined to work on this text. Nothing was charged.",
  AI_INPUT_TOO_LARGE: "That is too long for the AI. Try a smaller piece.",
  VALIDATION: "That request could not be sent. Check the text and try again.",
};

/** Plain-language text for a failed AI action. */
export function explainAiError(e: unknown): { code: string; message: string } {
  if (isApiError(e)) return { code: e.code, message: MESSAGES[e.code] ?? e.message };
  return { code: "UNKNOWN", message: e instanceof Error ? e.message : "Something went wrong with the AI request." };
}

export interface AiActions {
  /** Whether the server can answer at all (`fixture` = canned test answers, `unavailable` = not configured). */
  available: boolean;
  loaded: boolean;
  mode: "live" | "fixture" | "unavailable" | undefined;
  /** Credits left, when known. */
  credits: number | null;
  busy: boolean;
  error: { code: string; message: string } | null;
  clearError(): void;
  /** True while a call is waiting for the writer to accept the AI consent notice. */
  needsConsent: boolean;
  acceptConsent(): Promise<void>;
  declineConsent(): void;
  /**
   * Run one action: consent is asked for first when it has not been given, errors are turned into `error`, the
   * credit balance is refreshed afterwards. Resolves to the response, or null when it did not run or failed.
   */
  run<R>(call: (client: ScreenwriterClient) => Promise<AiActionResponse<R>>): Promise<AiActionResponse<R> | null>;
}

/**
 * Everything the AI action UIs share (skeleton generation, script generation, dialogue and scene polish): server
 * availability, the consent gate (the API refuses an action until the user has accepted the current consent
 * version), one busy/error state, and the credit balance.
 */
export function useAiActions(): AiActions {
  const sw = useScreenwriter();
  const status = useAiStatus();
  const consent = useAiConsent();
  const accept = useAcceptAiConsent();
  const balance = useCreditsBalance();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ code: string; message: string } | null>(null);
  const [needsConsent, setNeedsConsent] = useState(false);
  // What to run once consent is given: the call that was refused, and its promise's resolver.
  const pending = useRef<{ go: () => Promise<void> } | null>(null);

  const consented = consent.data ? consent.data.acceptedVersion === consent.data.currentVersion : null;

  const run = useCallback(
    <R,>(call: (client: ScreenwriterClient) => Promise<AiActionResponse<R>>): Promise<AiActionResponse<R> | null> =>
      new Promise(resolve => {
        const go = async () => {
          setError(null);
          setBusy(true);
          try {
            const res = await call(sw.client);
            void balance.refetch();
            resolve(res);
          } catch (e) {
            const err = explainAiError(e);
            if (err.code === "AI_CONSENT_REQUIRED") {
              // The cached consent was stale (accepted elsewhere, or a new version): ask, then go again.
              pending.current = { go: async () => void (await go()) };
              setNeedsConsent(true);
              return;
            }
            setError(err);
            resolve(null);
          } finally {
            setBusy(false);
          }
        };
        if (consented === false) {
          pending.current = { go };
          setNeedsConsent(true);
          return;
        }
        void go();
      }),
    [sw, consented, balance]
  );

  const acceptConsent = useCallback(async () => {
    const c = consent.data;
    if (!c) return;
    try {
      await accept.mutateAsync({ version: c.currentVersion });
    } catch (e) {
      setError(explainAiError(e));
      return;
    }
    setNeedsConsent(false);
    const p = pending.current;
    pending.current = null;
    await p?.go();
  }, [consent.data, accept]);

  const declineConsent = useCallback(() => {
    setNeedsConsent(false);
    pending.current = null;
  }, []);

  return {
    available: status.data?.available === true,
    loaded: !status.isLoading,
    mode: status.data?.mode,
    credits: balance.data?.balance ?? null,
    busy,
    error,
    clearError: () => setError(null),
    needsConsent,
    acceptConsent,
    declineConsent,
    run,
  };
}
