import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { TopBarConfig } from "@sudobility/building_blocks";
import { AuthActionAdapter } from "../components/layout/AuthActionAdapter";
import { LinkWrapper } from "../components/layout/LinkWrapper";
import { APP_NAME } from "../config";
import { useLang } from "./useLang";

// A monogram data-URI in place of a real logo asset (LogoConfig.src is required; this app has none yet).
const LOGO_SRC =
  "data:image/svg+xml," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" rx="6" fill="#171717"/><text x="16" y="22" font-family="sans-serif" font-size="18" font-weight="600" fill="#fff" text-anchor="middle">F</text></svg>`,
  );

/** The top bar, as configuration — `ScreenContainer` renders whatever this returns via `building_blocks`'
 * `AppPageLayout`, matching music_app's own `useTopBarConfig` pattern. */
export function useTopBarConfig(): TopBarConfig {
  const navigate = useNavigate();
  const lang = useLang();
  const { t } = useTranslation();
  const docsLabel = t("nav.docs");
  const resourcesLabel = t("nav.resources");

  return useMemo<TopBarConfig>(
    () => ({
      variant: "firebase",
      topBarVariant: "app",
      logo: {
        src: LOGO_SRC,
        alt: APP_NAME,
        appName: APP_NAME,
        onClick: () => navigate(`/${lang}`),
      },
      menuItems: [
        { id: "docs", label: docsLabel, href: `/${lang}/docs` },
        { id: "resources", label: resourcesLabel, href: `/${lang}/resources` },
      ],
      hideLanguageSelector: true,
      LinkComponent: LinkWrapper,
      AuthActionComponent: AuthActionAdapter,
      onLoginClick: () => navigate(`/${lang}/login`),
      sticky: true,
    }),
    [navigate, lang, docsLabel, resourcesLabel],
  );
}
