import { useTranslation } from "react-i18next";
import { AppTextPage, type TextPageContent } from "@sudobility/building_blocks";
import { APP_NAME, SUPPORT_EMAIL, APP_DOMAIN } from "../config";
import { translatedArray } from "../util/i18n-array";

/**
 * Public "Terms" page, built on `@sudobility/building_blocks`' `AppTextPage` — see `PrivacyPage.tsx` for the
 * same "adapted, not copied" note (this app has no subscriptions/billing, so that section is dropped; it
 * adds an explicit "you own your screenplay content" clause instead, since that's a real, meaningful thing
 * to state for this app's domain). Reasonable placeholder legal content, not reviewed by counsel.
 */
export function TermsPage() {
  const { t } = useTranslation();
  const items = (key: string) => translatedArray(t, key);

  const text: TextPageContent = {
    title: t("terms.title"),
    lastUpdated: t("terms.lastUpdated"),
    sections: [
      { title: t("terms.sections.acceptance.title"), content: t("terms.sections.acceptance.content", { appName: APP_NAME }) },
      { title: t("terms.sections.service.title"), content: t("terms.sections.service.content", { appName: APP_NAME }) },
      { title: t("terms.sections.accounts.title"), content: t("terms.sections.accounts.content") },
      { title: t("terms.sections.ownership.title"), content: t("terms.sections.ownership.content") },
      { title: t("terms.sections.usage.title"), description: t("terms.sections.usage.description"), items: items("terms.sections.usage.items") },
      { title: t("terms.sections.ai.title"), content: t("terms.sections.ai.content") },
      { title: t("terms.sections.liability.title"), content: t("terms.sections.liability.content", { appName: APP_NAME }) },
      { title: t("terms.sections.termination.title"), content: t("terms.sections.termination.content") },
      { title: t("terms.sections.changes.title"), content: t("terms.sections.changes.content") },
    ],
    contact: {
      title: t("terms.sections.contact.title"),
      description: t("terms.sections.contact.description"),
      info: {
        emailLabel: t("terms.sections.contact.emailLabel"),
        email: SUPPORT_EMAIL,
        websiteLabel: t("terms.sections.contact.websiteLabel"),
        websiteUrl: `https://${APP_DOMAIN}`,
      },
    },
  };

  return <AppTextPage text={text} lastUpdatedDate={new Date().toLocaleDateString()} />;
}
