import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button, Card, Grid, Heading, Section, Text } from "@sudobility/components";
import { useLang } from "../hooks/useLang";
import { APP_NAME } from "../config";

const FEATURE_KEYS = ["editor", "ai", "formats"] as const;

/** Public landing page: signed-out visitors land here, not on the sign-in form (see App.tsx). Built from
 * `@sudobility/components` primitives (Section/Card/Grid/Heading/Text/Button), matching music_app's own
 * HomePage.tsx — the topbar/footer chrome now comes from `ScreenContainer`, not a page-owned header. */
export function HomePage() {
  const { t } = useTranslation();
  const lang = useLang();

  return (
    <>
      <Section spacing="5xl" variant="hero">
        <div className="text-center">
          <Heading level={1} size="4xl" weight="bold" align="center">
            {APP_NAME}
          </Heading>
          <Text as="p" size="lg" color="muted" align="center" className="mx-auto mt-4 max-w-xl">
            {t("home.tagline")}
          </Text>
          <Link to={`/${lang}/login`}>
            <Button type="button" variant="primary" size="lg" className="mt-8 shadow">
              {t("home.logIn")}
            </Button>
          </Link>
        </div>
      </Section>

      <Section spacing="3xl">
        <Grid cols={{ sm: 3 }} gap="xl">
          {FEATURE_KEYS.map((key) => (
            <Card key={key} variant="elevated" padding="lg">
              <Heading level={2} size="lg" weight="semibold">
                {t(`home.features.${key}.title`)}
              </Heading>
              <Text as="p" size="sm" color="muted" className="mt-2">
                {t(`home.features.${key}.body`)}
              </Text>
            </Card>
          ))}
        </Grid>
      </Section>
    </>
  );
}
