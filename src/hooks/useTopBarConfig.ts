import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { AuthMenuItem, TopBarConfig } from "@sudobility/building_blocks";
import { AuthActionAdapter } from "../components/layout/AuthActionAdapter";
import { LinkWrapper } from "../components/layout/LinkWrapper";
import { APP_NAME } from "../config";
import { useLang } from "./useLang";
import { useAuth } from "../app/AuthContext";

/** The top bar, as configuration — `ScreenContainer` renders whatever this returns via `building_blocks`'
 * `AppPageLayout`, matching music_app's own `useTopBarConfig` pattern. */
export function useTopBarConfig(): TopBarConfig {
  const navigate = useNavigate();
  const lang = useLang();
  const { t } = useTranslation();
  const { user } = useAuth();
  const docsLabel = t("nav.docs");
  const resourcesLabel = t("nav.resources");
  const authenticatedMenuItems = useMemo<AuthMenuItem[]>(
    () => user ? [{
      id: "dashboard",
      label: t("dashboard.title", "Dashboard"),
      onClick: () => navigate(`/${lang}/projects`),
    }] : [],
    [user, t, navigate, lang],
  );

  return useMemo<TopBarConfig>(
    () => ({
      variant: "firebase",
      topBarVariant: "app",
      logo: {
        // The quill mark (public/logo.svg; its PNG/ICO derivatives come from `bun run icons`). The SVG itself, so it is crisp at any DPI.
        src: "/logo.svg",
        alt: APP_NAME,
        appName: APP_NAME,
        onClick: () => navigate(`/${lang}`),
      },
      menuItems: [
        { id: "docs", label: docsLabel, href: `/${lang}/docs` },
        { id: "resources", label: resourcesLabel, href: `/${lang}/resources` },
      ],
      authenticatedMenuItems,
      hideLanguageSelector: true,
      LinkComponent: LinkWrapper,
      AuthActionComponent: AuthActionAdapter,
      onLoginClick: () => navigate(`/${lang}/login`),
      sticky: true,
    }),
    [navigate, lang, docsLabel, resourcesLabel, authenticatedMenuItems, t],
  );
}
