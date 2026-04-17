"use client";

import type { Menu } from "lucide-react";

/** Shared icon-button treatment for the uncondensed dashboard toolbar buttons. */
export const toolbarButtonClassName =
  "cursor-pointer text-muted-foreground transition-colors duration-200 ease-out hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/** Shared layout footprint for icon-only toolbar buttons across breakpoints. */
export const toolbarIconButtonLayoutClassName =
  "inline-flex shrink-0 items-center justify-center";

/** Renders a dashboard toolbar icon button without a condensed circular wrapper. */
export function DashboardToolbarIconButton({
  ariaLabel,
  className,
  disabled,
  icon: Icon,
  onClick,
}: {
  ariaLabel: string;
  className?: string;
  disabled?: boolean;
  icon: typeof Menu;
  onClick: () => void;
}) {
  return (
    <button
      aria-label={ariaLabel}
      className={`
        ${toolbarButtonClassName}
        ${toolbarIconButtonLayoutClassName}
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
