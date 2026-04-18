"use client";

import { toolbarActionSkeletonClassName } from "@/app/dashboard/dashboard-components/DashboardToolbarActionButton";
import { Skeleton } from "@/components/ui/skeleton";

interface DashboardToolbarSkeletonProps {
  isDevelopmentMode: boolean;
  mobileToolbarBottom: boolean;
  mobileToolbarMirror: boolean;
}

/**
 * Mirrors the full toolbar footprint while the dashboard shell is still hydrating.
 * @param root0
 * @param root0.isDevelopmentMode
 * @param root0.mobileToolbarBottom
 * @param root0.mobileToolbarMirror
 */
export function DashboardToolbarSkeleton({
  isDevelopmentMode,
  mobileToolbarBottom,
  mobileToolbarMirror,
}: DashboardToolbarSkeletonProps) {
  const desktopActionCount = isDevelopmentMode ? 7 : 5;

  return (
    <div
      aria-hidden="true"
      className={
        mobileToolbarBottom
          ? `
            pointer-events-none fixed inset-x-0 bottom-0 z-50 border-t
            border-border/50 bg-background/80 pb-[env(safe-area-inset-bottom)]
            backdrop-blur-md
            lg:top-0 lg:bottom-auto lg:border-t-0 lg:border-b lg:pb-0
          `
          : `
            pointer-events-none fixed inset-x-0 top-0 z-50 border-b
            border-border/50 bg-background/80 backdrop-blur-md
          `
      }
      data-dashboard-toolbar-skeleton="true"
      suppressHydrationWarning
    >
      <div
        className={`
          mx-auto flex h-14 max-w-6xl items-center gap-4 px-4
          pr-[max(1rem,env(safe-area-inset-right))]
          pl-[max(1rem,env(safe-area-inset-left))]
          md:px-6
          ${
            mobileToolbarMirror
              ? `
        flex-row-reverse
        lg:flex-row
      `
              : ""
          }
        `}
        suppressHydrationWarning
      >
        <ToolbarMobileEdgeAction />
        <ToolbarTitleSkeleton />
        <ToolbarSearchSkeleton />
        <ToolbarMobileActions />
        <ToolbarDesktopActions desktopActionCount={desktopActionCount} />
      </div>
    </div>
  );
}

/**
 * @param root0
 * @param root0.desktopActionCount
 */
function ToolbarDesktopActions({
  desktopActionCount,
}: {
  desktopActionCount: number;
}) {
  return (
    <div
      className="
        hidden items-center gap-4
        md:flex
      "
      data-dashboard-toolbar-skeleton-desktop="true"
    >
      {Array.from({ length: desktopActionCount }, (_value, index) => (
        <Skeleton
          className="size-4 rounded-sm"
          data-dashboard-toolbar-skeleton-action="true"
          key={index}
        />
      ))}
      <Skeleton className="h-3 w-px rounded-full" />
      <Skeleton
        className="size-4 rounded-full"
        data-dashboard-toolbar-skeleton-action="true"
      />
    </div>
  );
}

/**
 *
 */
function ToolbarMobileActions() {
  return (
    <div
      className="
        flex items-center gap-4
        md:hidden
      "
      data-dashboard-toolbar-skeleton-mobile-actions="true"
    >
      <Skeleton
        className={toolbarActionSkeletonClassName}
        data-dashboard-toolbar-skeleton-action="true"
      />
      <Skeleton
        className={toolbarActionSkeletonClassName}
        data-dashboard-toolbar-skeleton-action="true"
      />
      <Skeleton
        className={toolbarActionSkeletonClassName}
        data-dashboard-toolbar-skeleton-action="true"
      />
    </div>
  );
}

/**
 *
 */
function ToolbarMobileEdgeAction() {
  return (
    <Skeleton
      className="
        size-4 rounded-sm
        lg:hidden
      "
      data-dashboard-toolbar-skeleton-action="true"
      data-dashboard-toolbar-skeleton-mobile-edge="true"
    />
  );
}

/**
 *
 */
function ToolbarSearchSkeleton() {
  return (
    <div
      className="relative min-w-0 flex-1"
      data-dashboard-toolbar-skeleton-search="true"
    >
      <Skeleton className="h-9 w-full rounded-lg" />
    </div>
  );
}

/**
 *
 */
function ToolbarTitleSkeleton() {
  return (
    <div
      className="flex min-w-0 shrink-0 items-center gap-2"
      data-dashboard-toolbar-skeleton-title="true"
    >
      <Skeleton className="size-5 rounded-sm" />
      <Skeleton
        className="
          h-5 w-24 rounded-full
          sm:w-32
        "
      />
    </div>
  );
}
