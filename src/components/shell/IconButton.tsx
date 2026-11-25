import type { ComponentType, MouseEvent, ReactNode } from "react";
import { Tooltip } from "@sudobility/components";
import { TOOLBAR_ICON } from "../../util/control-styles";

/**
 * A compact, square icon-only toolbar button with a styled tooltip + accessible label. Shares the toolbar
 * height/radius with the other controls. Pass `active` for toggles (adds `aria-pressed` + the active style);
 * omit it for plain actions. `badge` renders a small corner badge (e.g. a count).
 */
export function IconButton({
  icon: Icon,
  label,
  onClick,
  active,
  activeClassName = "bg-neutral-800 text-white",
  onMouseDown,
  disabled,
  testId,
  badge,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  onClick(): void;
  active?: boolean;
  activeClassName?: string;
  onMouseDown?(e: MouseEvent<HTMLButtonElement>): void;
  disabled?: boolean;
  testId?: string;
  badge?: ReactNode;
}) {
  return (
    <Tooltip content={label} placement="bottom" delayShow={150}>
      <button
        type="button"
        aria-label={label}
        aria-pressed={active}
        disabled={disabled}
        data-testid={testId}
        onMouseDown={onMouseDown}
        onClick={onClick}
        className={`${TOOLBAR_ICON} ${active ? activeClassName : "hover:bg-neutral-100 disabled:opacity-40 disabled:hover:bg-transparent"}`}
      >
        <Icon className="h-5 w-5" aria-hidden="true" />
        {badge}
      </button>
    </Tooltip>
  );
}
