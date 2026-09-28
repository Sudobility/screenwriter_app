import { useTranslation } from "react-i18next";
import type { FooterConfig } from "@sudobility/building_blocks";
import { LinkWrapper } from "../components/layout/LinkWrapper";
import { COMPANY_NAME, APP_NAME } from "../config";
import { useLang } from "./useLang";

const COPYRIGHT_YEAR = "2025-2026";

/**
 * The two footers, chosen by route depth — matches `../music_app`'s own `useFooterConfig.ts`: a full footer
 * (logo, tagline, grouped links) on the home page, a one-line compact footer everywhere else.
 *
 * Privacy/Terms are on both footers (`AppFooterProps.links`, the compact footer's own right-side-links
 * field — matches `../sudojo_app`'s compact footer); About/Docs/Resources/Contact are full-footer-only,
 * grouped as "Company", since no precedent anywhere puts them in the one-line compact footer too.
 */
export function useFooterConfig(variant: "full" | "compact"): FooterConfig {
  const lang = useLang();
  const { t } = useTranslation();

  const legalLinks = [
    { label: t("nav.privacy"), href: `/${lang}/privacy` },
    { label: t("nav.terms"), href: `/${lang}/terms` },
  ];

  if (variant === "compact") {
    return {
      variant: "compact",
      companyName: COMPANY_NAME,
      copyrightYear: COPYRIGHT_YEAR,
      rightsText: "All rights reserved",
      links: legalLinks,
      // As the top bar does: without it the library renders plain anchors and every footer link reloads the
      // whole app instead of navigating.
      LinkComponent: LinkWrapper,
    };
  }

  return {
    variant: "full",
    logo: { appName: APP_NAME },
    companyName: COMPANY_NAME,
    copyrightYear: COPYRIGHT_YEAR,
    rightsText: "All rights reserved",
    description: "Screenwriting, in the browser.",
    LinkComponent: LinkWrapper,
    linkSections: [
      {
        title: "Create",
        links: [{ label: "Projects", href: `/${lang}/projects` }],
      },
      {
        title: t("footer.company"),
        links: [
          { label: t("nav.about"), href: `/${lang}/about` },
          { label: t("nav.docs"), href: `/${lang}/docs` },
          { label: t("nav.resources"), href: `/${lang}/resources` },
          { label: t("nav.contact"), href: `/${lang}/contact` },
          ...legalLinks,
        ],
      },
    ],
  };
}
