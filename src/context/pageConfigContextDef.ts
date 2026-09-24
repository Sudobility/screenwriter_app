/**
 * PageConfig context definition: pages override the route-level layout (scrollable/maxWidth/padding) via
 * `useSetPageConfig`; `ScreenContainer` merges the overrides into `AppPageLayout`'s `page` prop. Matches
 * `../music_app`'s own `pageConfigContextDef.ts` exactly.
 */
import { createContext } from "react";
import type { AppPageProps } from "@sudobility/building_blocks";

export interface PageConfigContextValue {
  pageConfig: Partial<AppPageProps>;
  setPageConfig: (config: Partial<AppPageProps>) => void;
}

export const PageConfigContext = createContext<PageConfigContextValue>({
  pageConfig: {},
  setPageConfig: () => {},
});
