import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Heading, Section, Text } from "@sudobility/components";
import { useLang } from "../hooks/useLang";
import { APP_NAME } from "../config";

/** Public "About" page. No precedent in `../music_app` or `../sudojo_app` — designed fresh from
 * `HomePage`'s own `Section`/`Heading`/`Text` idiom, linking onward to Docs and Resources. */
export function AboutPage() {
  const { t } = useTranslation();
  const lang = useLang();

  return (
    <Section spacing="3xl">
      <div className="mx-auto max-w-2xl">
        <Heading level={1} size="3xl" weight="bold">
          {t("about.title", { appName: APP_NAME })}
        </Heading>
        <Text as="p" size="lg" color="muted" className="mt-4">
          {t("about.lead", { appName: APP_NAME })}
        </Text>
        <Text as="p" className="mt-6">
          {t("about.body", { appName: APP_NAME })}
        </Text>
        <div className="mt-8 flex flex-wrap gap-4 text-sm">
          <Link to={`/${lang}/docs`} className="font-medium text-primary hover:underline">
            {t("about.readDocs")}
          </Link>
          <Link to={`/${lang}/resources`} className="font-medium text-primary hover:underline">
            {t("about.seeResources")}
          </Link>
        </div>
      </div>
    </Section>
  );
}
