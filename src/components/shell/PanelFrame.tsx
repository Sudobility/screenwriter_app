import type { ReactNode } from "react";
import { NavBar } from "@sudobility/building_blocks";

const closeBtn = "border border-neutral-300 rounded px-2 py-1 text-xs hover:bg-neutral-100";

/**
 * The chrome for a single-screen right-hand panel: a {@link NavBar} (title + Close) over an
 * **always-scrollable** content area. It does NOT own the sliding drawer — the editor renders one
 * shared drawer (a single `SlidePanel`) and swaps the active panel's frame inside it, so only one
 * panel is ever shown and switching slides the old one out before the new one slides in.
 */
export function PanelFrame({
  title,
  subtitle,
  onClose,
  testId,
  ariaLabel,
  bodyClassName = "p-3 space-y-4",
  children,
}: {
  title: string;
  subtitle?: string;
  onClose(): void;
  testId?: string;
  ariaLabel?: string;
  /** Classes for the inner (scrolling) content wrapper. */
  bodyClassName?: string;
  children: ReactNode;
}) {
  return (
    <div data-testid={testId} aria-label={ariaLabel ?? title} className="print:hidden h-full w-full flex flex-col overflow-hidden bg-neutral-50">
      <NavBar
        spec={{ title, subtitle }}
        renderActions={() => (
          <button type="button" className={closeBtn} data-testid="panel-close" onClick={onClose}>
            Close
          </button>
        )}
      />
      <div className="min-h-0 flex-1 overflow-auto">
        <div className={bodyClassName}>{children}</div>
      </div>
    </div>
  );
}
