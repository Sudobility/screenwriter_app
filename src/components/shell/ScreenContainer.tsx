/**
 * Route-level page shell: `AppPageLayout` from `@sudobility/building_blocks` provides the top bar, breadcrumbs,
 * content area and footer; pages override layout via `useSetPageConfig` and declare their own breadcrumb trail
 * via `useSetBreadcrumbs`. Mounted once as a layout route — never per page. Matches `../music_app`'s own
 * `ScreenContainer.tsx` (bar/footer built by `useTopBarConfig`/`useFooterConfig`, breadcrumbs opt-in per page via
 * context rather than derived from the route, for the same reason: this app's routes are shallow enough that a
 * generic per-segment walker would produce a meaningless crumb for a segment like `/p` in `/p/:projectId` that
 * isn't itself a page anyone navigates to). `App.tsx`'s route tree renders `<ScreenContainer><Outlet/></ScreenContainer>`
 * as the layout-route element, mirroring music_app's `ScreenContainerLayout` wrapper.
 */
import { useState, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { AppPageLayout } from "@sudobility/building_blocks";
import type { AppPageProps, BreadcrumbItem } from "@sudobility/building_blocks";
import { PageConfigContext } from "../../context/pageConfigContextDef";
import { BreadcrumbContext } from "../../context/breadcrumbContextDef";
import { usePageConfig } from "../../hooks/usePageConfig";
import { useBreadcrumbItems } from "../../hooks/useBreadcrumbs";
import { useFooterConfig } from "../../hooks/useFooterConfig";
import { useTopBarConfig } from "../../hooks/useTopBarConfig";
import { LinkWrapper } from "../layout/LinkWrapper";

function ScreenContainerInner({ children }: { children: ReactNode }) {
  const location = useLocation();
  // /:lang -> home; /:lang/anything-else -> not home. (music_app's own isHomePage check, same shape.)
  const pathParts = location.pathname.split("/").filter(Boolean);
  const isHomePage = pathParts.length <= 1;

  const topBar = useTopBarConfig();
  const footer = useFooterConfig(isHomePage ? "full" : "compact");

  const pageConfigOverrides = usePageConfig();
  const breadcrumbItems = useBreadcrumbItems();
  const page: AppPageProps = {
    // `layoutMode`, not just `maxWidth`: it feeds building_blocks' internal `LayoutProvider`, which the topbar,
    // footer, and Section's own full-bleed math all read for their width — omitting it left the content column
    // collapsed to ~32px while Section's bleed children still spanned the viewport (music_app's ScreenContainer.tsx
    // documents the identical failure: "the page's cards started at 32px").
    layoutMode: "full",
    maxWidth: "5xl",
    // `contentClassName: "w-full min-w-0"`: without an explicit width, the content wrapper's cross-axis size in
    // building_blocks' flex-column layout resolves via shrink-to-fit instead of stretching to the available
    // (maxWidth-capped) width — it collapses to whatever its own content's intrinsic width happens to be (a plain
    // page with no wide element can end up far narrower than 1024px, not just the ~32px "Section bleed" case this
    // file's other comment describes). `w-full` forces the intended width regardless of content; `min-w-0` keeps
    // it shrinkable so a genuinely narrow viewport can still compress it. Matches music_app's own `page` config.
    contentClassName: "w-full min-w-0",
    ...pageConfigOverrides,
  };

  return (
    <AppPageLayout
      topBar={topBar}
      breadcrumbs={breadcrumbItems ? { items: breadcrumbItems, LinkComponent: LinkWrapper } : undefined}
      footer={footer}
      page={page}
    >
      {children}
    </AppPageLayout>
  );
}

export function ScreenContainer({ children }: { children: ReactNode }) {
  const [pageConfig, setPageConfig] = useState<Partial<AppPageProps>>({});
  const [breadcrumbItems, setBreadcrumbItems] = useState<BreadcrumbItem[] | null>(null);
  return (
    <PageConfigContext.Provider value={{ pageConfig, setPageConfig }}>
      <BreadcrumbContext.Provider value={{ items: breadcrumbItems, setItems: setBreadcrumbItems }}>
        <ScreenContainerInner>{children}</ScreenContainerInner>
      </BreadcrumbContext.Provider>
    </PageConfigContext.Provider>
  );
}
