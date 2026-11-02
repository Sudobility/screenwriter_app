/**
 * The credit balance as a small inline badge.
 *
 * Its own `useBalance` subscriber, deliberately: the balance changes on every
 * AI action, and reading it higher up would re-render the editor with it.
 *
 * Note: the app's top bar is declarative `building_blocks` `TopBarConfig`,
 * which has no slot for a live React node, so this badge is placed in the
 * dashboard credits area rather than the global bar.
 */
import { useNavigate } from "react-router-dom";
import { useBalance } from "@sudobility/consumables_client";
import { CreditBalanceBadge } from "@sudobility/consumables_pages";
import { useLang } from "../../hooks/useLang";

export function CreditBadge() {
  const navigate = useNavigate();
  const lang = useLang();
  const { balance } = useBalance();

  // Nothing rather than a placeholder: a badge showing "0" before the balance
  // arrives reads as "you are out of credits", which is false and alarming.
  // Signed out, there is no balance to show at all.
  if (balance === null) return null;

  return (
    <CreditBalanceBadge
      balance={balance}
      isLoading={false}
      onClick={() => navigate(`/${lang}/projects`)}
    />
  );
}
