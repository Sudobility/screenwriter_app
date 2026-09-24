import type { FooterConfig } from "@sudobility/building_blocks";
import { LinkWrapper } from "../components/layout/LinkWrapper";
import { COMPANY_NAME, APP_NAME } from "../config";
import { useLang } from "./useLang";

const COPYRIGHT_YEAR = "2025-2026";

/**
 * The two footers, chosen by route depth — matches `../music_app`'s own `useFooterConfig.ts`: a full footer
 * (logo, tagline, grouped links) on the home page, a one-line compact footer everywhere else.
 */
export function useFooterConfig(variant: "full" | "compact"): FooterConfig {
  const lang = useLang();

  if (variant === "compact") {
    return {
      variant: "compact",
      companyName: COMPANY_NAME,
      copyrightYear: COPYRIGHT_YEAR,
      rightsText: "All rights reserved",
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
        title: "Account",
        links: [{ label: "API keys", href: `/${lang}/settings/keys` }],
      },
    ],
  };
}
