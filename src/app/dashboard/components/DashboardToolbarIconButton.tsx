"use client";

import type { Menu } from "lucide-react";

/** Shared icon-button treatment for the uncondensed dashboard toolbar buttons. */
export const toolbarButtonClassName =
  "cursor-pointer text-muted-foreground transition-colors duration-200 ease-out hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/** Shared layout footprint for icon-only toolbar buttons across breakpoints. */
export const toolbarIconButtonLayoutClassName =
  "inline-flex shrink-0 items-center justify-center";
/**
 * Describes the props for the dashboard toolbar icon button component.
 */
interface DashboardToolbarIconButtonProps {
  ariaLabel: string;
  ariaPressed?: boolean;
  className?: string;
  disabled?: boolean;
  icon: typeof Menu;
  isActive?: boolean;
  onClick: () => void;
}

/**
 * Render the dashboard toolbar icon button component.
 * @param props - The component props.
 * @returns The rendered dashboard toolbar icon button component.
 */
export function DashboardToolbarIconButton(
  props: DashboardToolbarIconButtonProps,
) {
  const {
    ariaLabel,
    ariaPressed,
    className,
    disabled,
    icon: Icon,
    isActive = false,
    onClick,
  } = props;
  return (
    <button
      aria-label={ariaLabel}
      aria-pressed={ariaPressed}
      className={`
        ${toolbarButtonClassName}
        ${toolbarIconButtonLayoutClassName}
        ${isActive ? `text-foreground` : ""}
        ${disabled ? `disabled:cursor-not-allowed disabled:opacity-60` : ""}
        ${
          className
            ? `
        ${className}
      `
            : ""
        }
      `}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      <Icon className="size-4" />
    </button>
  );
}
