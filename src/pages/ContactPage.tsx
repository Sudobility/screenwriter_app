import { useTranslation } from "react-i18next";
import { Heading, Section, Text } from "@sudobility/components";
import { SUPPORT_EMAIL } from "../config";
import { translatedArray } from "../util/i18n-array";

/** Public "Contact" page — matches `../sudojo_app`'s `SupportPage.tsx` (a mailto plus a short "what to
 * include" list), not `AppTextPage` (this isn't sectioned legal text). No precedent in `../music_app`. */
export function ContactPage() {
  const { t } = useTranslation();
  const items = translatedArray(t, "contact.whatToInclude.items");

  return (
    <Section spacing="3xl">
      <div className="mx-auto max-w-2xl">
        <Heading level={1} size="3xl" weight="bold">
          {t("contact.title")}
        </Heading>
        <Text as="p" size="lg" color="muted" className="mt-4">
          {t("contact.lead")}
        </Text>
        <a
          href={`mailto:${SUPPORT_EMAIL}`}
          className="mt-8 inline-flex items-center gap-2 text-xl font-semibold text-primary hover:underline"
        >
          {SUPPORT_EMAIL}
        </a>

        <div className="mt-12">
          <Heading level={2} size="xl" weight="semibold">
            {t("contact.whatToInclude.title")}
          </Heading>
          <ul className="ml-6 mt-4 list-disc space-y-2">
            {items.map((item) => (
              <li key={item}>
                <Text color="muted">{item}</Text>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Section>
  );
}
