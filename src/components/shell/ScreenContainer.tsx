/**
 * Route-level page shell: `AppShell` from `@sudobility/building_blocks` provides the top bar, breadcrumbs,
 * content area and footer, and owns the page-config context (pages override layout via `useSetPageConfig`).
 * Mounted once as a layout route — never per page. The bar/footer are configuration built by
 * `useTopBarConfig`/`useFooterConfig`; breadcrumbs are opt-in per page via this app's own `BreadcrumbContext`
 * (kept here — the shared shell takes the resolved items as a prop).
 */
import { useState, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { AppShell } from "@sudobility/building_blocks";
import type { BreadcrumbItem } from "@sudobility/building_blocks";
import { BreadcrumbContext } from "../../context/breadcrumbContextDef";
import { useBreadcrumbItems } from "../../hooks/useBreadcrumbs";
import { routeBreadcrumbs } from "../../util/breadcrumbs";
import { useFooterConfig } from "../../hooks/useFooterConfig";
import { useTopBarConfig } from "../../hooks/useTopBarConfig";
import { LinkWrapper } from "../layout/LinkWrapper";

function ScreenContainerInner({ children }: { children: ReactNode }) {
  const location = useLocation();
  const isHomePage = location.pathname.split("/").filter(Boolean).length <= 1;

  const topBar = useTopBarConfig();
  const footer = useFooterConfig(isHomePage ? "full" : "compact");
  // A page's own trail wins; otherwise fall back to a trail derived from the route, so every page in the
  // app shows breadcrumbs (home + the static content pages all get one here).
  const lang = location.pathname.split("/").filter(Boolean)[0] ?? "en";
  const breadcrumbItems = useBreadcrumbItems() ?? routeBreadcrumbs(location.pathname, lang);

  return (
    <AppShell
      topBar={topBar}
      breadcrumbs={breadcrumbItems ? { items: breadcrumbItems, LinkComponent: LinkWrapper } : undefined}
      footer={footer}
      pageDefaults={{
        layoutMode: "full",
        maxWidth: "5xl",
        contentClassName: "w-full min-w-0",
      }}
    >
      {children}
    </AppShell>
  );
}

export function ScreenContainer({ children }: { children: ReactNode }) {
  const [breadcrumbItems, setBreadcrumbItems] = useState<BreadcrumbItem[] | null>(null);
  return (
    <BreadcrumbContext.Provider value={{ items: breadcrumbItems, setItems: setBreadcrumbItems }}>
      <ScreenContainerInner>{children}</ScreenContainerInner>
    </BreadcrumbContext.Provider>
  );
}
