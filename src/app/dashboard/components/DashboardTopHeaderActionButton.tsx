import { type LucideIcon } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";

interface DashboardTopHeaderActionButtonProps {
  ariaLabel: string;
  className?: string;
  icon: LucideIcon;
  isPending: boolean;
  onClick: () => void;
}

interface DashboardTopHeaderActionIconProps {
  icon: LucideIcon;
  isPending: boolean;
}

/**
 * Canonical action button for the dashboard top-header icon bar.
 */
export function DashboardTopHeaderActionButton({
  ariaLabel,
  className,
  icon,
  isPending,
  onClick,
}: DashboardTopHeaderActionButtonProps) {
  return (
    <button
      aria-busy={isPending}
      aria-label={ariaLabel}
      className={`
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
      <DashboardTopHeaderActionIcon icon={icon} isPending={isPending} />
    </button>
  );
}

/**
 * Shared toolbar icon that swaps to a shadcn skeleton while its action is active.
 */
export function DashboardTopHeaderActionIcon({
  icon: Icon,
  isPending,
}: DashboardTopHeaderActionIconProps) {
  if (isPending) {
    return (
      <Skeleton
        aria-hidden="true"
        className="size-4 rounded-sm"
        data-dashboard-top-header-action-skeleton="true"
      />
    );
  }

  return <Icon className="size-4" />;
}