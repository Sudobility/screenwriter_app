import type { ReactNode } from "react";
import { XMarkIcon } from "@heroicons/react/24/outline";
import { Tooltip } from "@sudobility/components";
import { NavBar } from "@sudobility/building_blocks";

const closeBtn = "inline-flex h-8 w-8 items-center justify-center rounded text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900";

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
          <Tooltip content="Close" placement="bottom" delayShow={150}>
            <button type="button" className={closeBtn} data-testid="panel-close" aria-label="Close" onClick={onClose}>
              <XMarkIcon className="h-5 w-5" aria-hidden="true" />
            </button>
          </Tooltip>
        )}
      />
      <div className="min-h-0 flex-1 overflow-auto">
        <div className={bodyClassName}>{children}</div>
      </div>
    </div>
  );
}
