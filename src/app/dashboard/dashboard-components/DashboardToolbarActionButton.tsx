import { type LucideIcon } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";

interface DashboardToolbarActionButtonProps {
  ariaLabel: string;
  className?: string;
  icon: LucideIcon;
  isPending: boolean;
  onClick: () => void;
}

interface DashboardToolbarActionIconProps {
  icon: LucideIcon;
  isPending: boolean;
}

/** Shared uncondensed toolbar action layout used by desktop and mobile buttons. */
export const toolbarActionButtonLayoutClassName =
  "inline-flex shrink-0 items-center justify-center";

/** Shared toolbar action skeleton footprint for non-theme icon actions. */
export const toolbarActionSkeletonClassName = "size-4 rounded-sm";

/**
 * Renders a canonical icon button for dashboard toolbar actions.
 * @param root0
 * @param root0.ariaLabel
 * @param root0.className
 * @param root0.icon
 * @param root0.isPending
 * @param root0.onClick
 */
export function DashboardToolbarActionButton({
  ariaLabel,
  className,
  icon,
  isPending,
  onClick,
}: DashboardToolbarActionButtonProps) {
  return (
    <button
      aria-busy={isPending}
      aria-label={ariaLabel}
      className={`
        ${toolbarActionButtonLayoutClassName}
        cursor-pointer text-muted-foreground transition-colors duration-200
        ease-out
        hover:text-foreground
        focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none
        disabled:cursor-not-allowed disabled:opacity-70
        ${className ?? ""}
      `}
      disabled={isPending}
      onClick={onClick}
      type="button"
    >
      <DashboardToolbarActionIcon icon={icon} isPending={isPending} />
    </button>
  );
}

/**
 * Swaps a toolbar icon for a skeleton while its action is active.
 * @param root0
 * @param root0.icon
 * @param root0.isPending
 */
export function DashboardToolbarActionIcon({
  icon: Icon,
  isPending,
}: DashboardToolbarActionIconProps) {
  if (isPending) {
    return (
      <Skeleton
        aria-hidden="true"
        className={toolbarActionSkeletonClassName}
        data-dashboard-toolbar-action-skeleton="true"
      />
    );
  }

  return <Icon className="size-4" />;
}
