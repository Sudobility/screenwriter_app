import { useTranslation } from "react-i18next";
import { Card, Grid, Heading, Section, Text } from "@sudobility/components";

interface ResourceLink {
  key: string;
  href: string;
}

const IMPORT_SOURCES: ResourceLink[] = [
  { key: "simplyScripts", href: "https://www.simplyscripts.com/" },
  { key: "imsdb", href: "https://imsdb.com/" },
];

const LEARN_FORMAT: ResourceLink[] = [
  { key: "fountainSpec", href: "https://fountain.io/syntax" },
  { key: "wgaFormatting", href: "https://www.wga.org/the-guild/about-us/advocacy/screenwriting-101" },
];

/** Public "Resources" page — outbound links grouped by what they're useful for, matching `../music_app`'s
 * `ResourcesPage.tsx` grouping principle, simplified: no icon-vendoring pipeline, plain text links. Every
 * link leaves the app, so each carries `rel="noopener noreferrer"` (a target-blank link without it hands
 * the opened page a live `window.opener`). Built from the same `Section`/`Card`/`Grid`/`Heading`/`Text`
 * vocabulary as `HomePage`. */
export function ResourcesPage() {
  const { t } = useTranslation();

  const group = (title: string, links: ResourceLink[]) => (
    <div>
      <Heading level={2} size="xl" weight="semibold" className="mb-4">
        {title}
      </Heading>
      <Grid cols={{ sm: 2 }} gap="lg">
        {links.map((r) => (
          <Card key={r.key} variant="bordered" padding="lg">
            <a href={r.href} target="_blank" rel="noopener noreferrer" className="block">
              <Heading level={3} size="lg" weight="semibold" color="primary">
                {t(`resources.links.${r.key}.title`)}
              </Heading>
              <Text as="p" size="sm" color="muted" className="mt-1">
                {t(`resources.links.${r.key}.body`)}
              </Text>
              <Text as="p" size="sm" color="muted" className="mt-2">
                {new URL(r.href).host}
              </Text>
            </a>
          </Card>
        ))}
      </Grid>
    </div>
  );

  return (
    <Section spacing="3xl">
      <Heading level={1} size="3xl" weight="bold">
        {t("resources.title")}
      </Heading>
      <Text as="p" size="lg" color="muted" className="mt-4 max-w-2xl">
        {t("resources.lead")}
      </Text>
      <div className="mt-10 flex flex-col gap-10">
        {group(t("resources.groups.import"), IMPORT_SOURCES)}
        {group(t("resources.groups.learn"), LEARN_FORMAT)}
      </div>
    </Section>
  );
}
