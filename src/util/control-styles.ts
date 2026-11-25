/**
 * Shared styling for the compact editor-toolbar controls so they all share ONE height (`h-9`) and corner
 * radius (`rounded` = 4px). The DS `Button` is a 44px touch target (`min-h-[44px]`), too tall for this dense
 * toolbar, so the toolbar's buttons use this compact style. The adjacent DS `Select`s (style picker / insert
 * technique) are given a matching `rounded` className so the whole toolbar lines up on the same radius.
 */

/** Base for a compact toolbar control: one shared height (`h-9`) and corner radius (`rounded` = 4px). */
export const TOOLBAR_CONTROL = "inline-flex items-center justify-center h-9 rounded border border-neutral-300 px-3 text-sm whitespace-nowrap transition-colors";

/** Idle (not-pressed) appearance; append after {@link TOOLBAR_CONTROL}. */
export const TOOLBAR_IDLE = "bg-white hover:bg-neutral-100 disabled:opacity-40 disabled:hover:bg-white";

/** A square icon-only toolbar control (same h-9 height + radius as the rest; width = height). */
export const TOOLBAR_ICON = "relative inline-flex h-9 w-9 items-center justify-center rounded border border-neutral-300";
