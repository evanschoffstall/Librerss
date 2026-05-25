import { type LucideIcon } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";

/**
 * Describes the props for the dashboard toolbar action button component.
 */
interface DashboardToolbarActionButtonProps {
  ariaLabel: string;
  className?: string;
  icon: LucideIcon;
  isPending: boolean;
  onClick: () => void;
}

/**
 * Describes the props for the dashboard toolbar action icon component.
 */
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
 * Render the dashboard toolbar action button component.
 * @param props - The component props.
 * @returns The rendered dashboard toolbar action button component.
 */
export function DashboardToolbarActionButton(
  props: DashboardToolbarActionButtonProps,
) {
  const { ariaLabel, className, icon, isPending, onClick } = props;
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
 * Render the dashboard toolbar action icon component.
 * @param props - The component props.
 * @returns The rendered dashboard toolbar action icon component.
 */
export function DashboardToolbarActionIcon(
  props: DashboardToolbarActionIconProps,
) {
  const { icon: Icon, isPending } = props;
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
