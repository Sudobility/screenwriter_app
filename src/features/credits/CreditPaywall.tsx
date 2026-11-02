/**
 * The out-of-credits paywall, mounted once above the app.
 *
 * An AI action refused for want of credits (`INSUFFICIENT_CREDITS`, surfaced by
 * `useAiActions`) is the one refusal with an obvious remedy, so it opens the
 * store rather than only reporting an error. The dialog itself is
 * `CreditPaywallDialog` from `@sudobility/consumables_pages` (purely
 * presentational); this file supplies the words (i18n), the payment data (via
 * `useCreditStore`) and the open/close wiring.
 *
 * `useCreditPaywall` has a no-op default, so a component that calls it outside
 * the provider (a unit test rendering an editor piece in isolation) gets a
 * safe no-op rather than a thrown error.
 */
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useTranslation } from "react-i18next";
import { CreditPaywallDialog } from "@sudobility/consumables_pages";
import { useCreditStore } from "./useCreditStore";

export interface CreditPaywallContextValue {
  /** Opens the store over the current page because a job was refused for credits. */
  openPaywall: () => void;
  /** Closes it without buying. */
  closePaywall: () => void;
}

const CreditPaywallContext = createContext<CreditPaywallContextValue>({
  openPaywall: () => {},
  closePaywall: () => {},
});

export function CreditPaywallProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const openPaywall = useCallback(() => setOpen(true), []);
  const closePaywall = useCallback(() => setOpen(false), []);
  const value = useMemo(
    () => ({ openPaywall, closePaywall }),
    [openPaywall, closePaywall],
  );

  const storeProps = useCreditStore({ onPurchased: closePaywall });

  return (
    <CreditPaywallContext.Provider value={value}>
      {children}
      <CreditPaywallDialog
        {...storeProps}
        isOpen={open}
        onClose={closePaywall}
        labels={{
          ...storeProps.labels,
          // The only copy that is the modal's own: why it appeared, rather than
          // what it contains. The store's own heading is suppressed inside it.
          paywallTitle: t("credits.outOfCreditsTitle", "Out of credits"),
          paywallMessage: t(
            "credits.outOfCreditsBody",
            "You need more credits to run this. Nothing was charged.",
          ),
          closeLabel: t("common.closeDialog", "Close"),
        }}
      />
    </CreditPaywallContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useCreditPaywall(): CreditPaywallContextValue {
  return useContext(CreditPaywallContext);
}
