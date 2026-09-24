/**
 * Breadcrumb context definition: a page declares its own trail via `useSetBreadcrumbs`; `ScreenContainer` reads it
 * back and hands it to `AppPageLayout`'s `breadcrumbs` prop. `null` (nothing set, the default) means no breadcrumb
 * bar at all. Matches `../music_app`'s own `breadcrumbContextDef.ts` exactly.
 */
import { createContext } from "react";
import type { BreadcrumbItem } from "@sudobility/building_blocks";

export interface BreadcrumbContextValue {
  items: BreadcrumbItem[] | null;
  setItems: (items: BreadcrumbItem[] | null) => void;
}

export const BreadcrumbContext = createContext<BreadcrumbContextValue>({
  items: null,
  setItems: () => {},
});
