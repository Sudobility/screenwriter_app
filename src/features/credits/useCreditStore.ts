/**
 * Screenwriter labels and navigation around the shared consumables store.
 *
 * Mirrors music_app's `useCreditStore`: the data, copy and callbacks for
 * `CreditStorePage` come from here, so the store page and the paywall modal
 * share one source and cannot drift apart in what a credit is called or what a
 * package costs. Presentation lives in `@sudobility/consumables_pages`.
 */
import { useTranslation } from "react-i18next";
import {
  useBalance,
  useConsumableProducts,
  usePurchaseCredits,
} from "@sudobility/consumables_client";
import type { CreditPackage } from "@sudobility/consumables_client";
import type { CreditStorePageProps } from "@sudobility/consumables_pages";
import { useAuth } from "../../app/AuthContext";
import { useSignIn } from "../../app/SignInContext";
import { REVENUECAT_API_KEY } from "../../config";

export type UseCreditStoreOptions = { onPurchased?: () => void };

export function useCreditStore({
  onPurchased,
}: UseCreditStoreOptions = {}): CreditStorePageProps {
  const { t } = useTranslation();
  const { openSignIn } = useSignIn();
  const { user } = useAuth();
  const balanceState = useBalance();
  // An empty offering ID asks the shared client for every configured offering.
  const products = useConsumableProducts("");
  const purchaseState = usePurchaseCredits();

  return {
    isAuthenticated: user !== null,
    balance: balanceState.balance,
    packages: products.packages,
    isLoading: balanceState.isLoading || products.isLoading,
    isPurchasing: purchaseState.isPurchasing,
    error:
      purchaseState.error?.message ??
      balanceState.error?.message ??
      products.error?.message ??
      null,
    onPurchase: async (packageId: string) => {
      const selected = products.packages.find(
        (pkg: CreditPackage) => pkg.packageId === packageId,
      );
      if (!selected?.offeringId)
        throw new Error("This credit package is no longer available.");
      const purchased = await purchaseState.purchase(
        selected.storePackageId ?? selected.packageId,
        selected.offeringId,
      );
      if (purchased) onPurchased?.();
    },
    // Over the page that asked, never a trip to the login route: signing in
    // leaves the reader on the store (or the paywall), now signed in.
    onLoginClick: () => openSignIn(),
    labels: {
      title: t("credits.title", "Credits"),
      currentBalanceLabel: t("credits.balance", "Your balance"),
      creditsUnit: t("credits.unit", "credits"),
      purchaseButton: t("credits.buy", "Buy"),
      purchasingButton: t("credits.buying", "Purchasing…"),
      noProducts: REVENUECAT_API_KEY
        ? t("credits.noPackages", "No credit packages are available right now.")
        : // TODO: set VITE_REVENUECAT_API_KEY so RevenueCat offerings load.
          t(
            "credits.noPackagesNoKey",
            "Set VITE_REVENUECAT_API_KEY to show purchases.",
          ),
      errorTitle: t("credits.errorTitle", "Credit store error"),
      loginRequired: t("credits.loginRequired", "Sign in to purchase credits."),
      loginButton: t("credits.loginButton", "Sign in"),
    },
    formatters: {
      formatCredits: (count: number) => count.toLocaleString(),
      getPackageDescription: () =>
        t("credits.packageDescription", "Credits for AI writing."),
    },
  };
}
