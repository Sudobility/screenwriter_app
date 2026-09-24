import { useTranslation } from "react-i18next";
import { AppTextPage, type TextPageContent } from "@sudobility/building_blocks";
import { APP_NAME, SUPPORT_EMAIL, APP_DOMAIN } from "../config";
import { translatedArray } from "../util/i18n-array";

/**
 * Public "Privacy" page, built on `@sudobility/building_blocks`' `AppTextPage` — the same building block
 * `../sudojo_app`'s `PrivacyPage.tsx` uses, not this app's boilerplate copied as-is: content is adapted to
 * what this app actually does (Firebase Google sign-in plus the dev-only email bypass, AI review/polish
 * processing of screenplay content, offline `IndexedDB` local storage, no subscriptions/billing — this app
 * has none, unlike `sudojo_app`). Reasonable placeholder legal content, not reviewed by counsel.
 */
export function PrivacyPage() {
  const { t } = useTranslation();
  const items = (key: string) => translatedArray(t, key);

  const text: TextPageContent = {
    title: t("privacy.title"),
    lastUpdated: t("privacy.lastUpdated"),
    sections: [
      { title: t("privacy.sections.introduction.title"), content: t("privacy.sections.introduction.content", { appName: APP_NAME }) },
      {
        title: t("privacy.sections.collection.title"),
        subsections: [
          { title: t("privacy.sections.collection.youProvide.title"), items: items("privacy.sections.collection.youProvide.items") },
          { title: t("privacy.sections.collection.automatic.title"), items: items("privacy.sections.collection.automatic.items") },
        ],
      },
      { title: t("privacy.sections.usage.title"), description: t("privacy.sections.usage.description"), items: items("privacy.sections.usage.items") },
      { title: t("privacy.sections.ai.title"), content: t("privacy.sections.ai.content", { appName: APP_NAME }) },
      { title: t("privacy.sections.storage.title"), content: t("privacy.sections.storage.content") },
      { title: t("privacy.sections.sharing.title"), description: t("privacy.sections.sharing.description"), items: items("privacy.sections.sharing.items") },
      { title: t("privacy.sections.retention.title"), content: t("privacy.sections.retention.content") },
      { title: t("privacy.sections.rights.title"), description: t("privacy.sections.rights.description"), items: items("privacy.sections.rights.items") },
      { title: t("privacy.sections.children.title"), content: t("privacy.sections.children.content") },
      { title: t("privacy.sections.changes.title"), content: t("privacy.sections.changes.content") },
    ],
    contact: {
      title: t("privacy.sections.contact.title"),
      description: t("privacy.sections.contact.description"),
      info: {
        emailLabel: t("privacy.sections.contact.emailLabel"),
        email: SUPPORT_EMAIL,
        websiteLabel: t("privacy.sections.contact.websiteLabel"),
        websiteUrl: `https://${APP_DOMAIN}`,
      },
    },
  };

  return <AppTextPage text={text} lastUpdatedDate={new Date().toLocaleDateString()} />;
}
