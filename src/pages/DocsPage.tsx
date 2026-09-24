import { useTranslation } from "react-i18next";
import { Heading, Section, Text } from "@sudobility/components";

const TOPICS = ["gettingStarted", "formatting", "shortcuts", "importExport", "structure", "titlePage", "snapshots"] as const;

const SHORTCUTS = [
  { key: "styleShortcut" },
  { key: "styleCycle" },
  { key: "dualDialogue" },
  { key: "undo" },
  { key: "redo" },
] as const;

/**
 * Public "Docs" page — one page with an in-page topic nav (anchor links), not `../music_app`'s multi-route
 * master/detail `DocsPage`: this app has far fewer topics, so a single scrollable page reads better than a
 * route per topic. Content is drawn from what this app actually does, per its own CLAUDE.md Behaviour notes
 * (formatting/smart paste, keyboard shortcuts, import/export, structure tools, title page, snapshots) rather
 * than generic filler. `Section`/`Heading`/`Text`, matching `HomePage`'s idiom.
 */
export function DocsPage() {
  const { t } = useTranslation();

  return (
    <Section spacing="3xl">
      <div className="grid grid-cols-1 gap-10 md:grid-cols-[200px_1fr]">
        <nav aria-label={t("docs.navLabel")} className="flex flex-row flex-wrap gap-3 md:sticky md:top-24 md:flex-col md:self-start">
          {TOPICS.map((topic) => (
            <a key={topic} href={`#${topic}`} className="text-sm font-medium text-muted-foreground hover:text-primary hover:underline">
              {t(`docs.topics.${topic}.title`)}
            </a>
          ))}
        </nav>

        <div className="flex flex-col gap-12">
          <Heading level={1} size="3xl" weight="bold">
            {t("docs.title")}
          </Heading>

          {TOPICS.map((topic) => (
            <div key={topic} id={topic} className="scroll-mt-24">
              <Heading level={2} size="xl" weight="semibold">
                {t(`docs.topics.${topic}.title`)}
              </Heading>
              <Text as="p" color="muted" className="mt-3">
                {t(`docs.topics.${topic}.body`)}
              </Text>

              {topic === "shortcuts" && (
                <dl className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {SHORTCUTS.map((s) => (
                    <div key={s.key} className="flex items-baseline justify-between gap-4 rounded border border-border px-4 py-2">
                      <dt>
                        <Text size="sm" color="muted">
                          {t(`docs.shortcuts.${s.key}.label`)}
                        </Text>
                      </dt>
                      <dd>
                        <Text size="sm" weight="semibold" className="font-mono">
                          {t(`docs.shortcuts.${s.key}.keys`)}
                        </Text>
                      </dd>
                    </div>
                  ))}
                </dl>
              )}
            </div>
          ))}
        </div>
      </div>
    </Section>
  );
}
