import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface DashboardSurfaceSkeletonProps {
  children: React.ReactNode;
  containerClassName: string;
  surfaceClassName?: string;
}

/**
 * Shared article-list loading surface used by both the route shell and live feed.
 *
 * A single large skeleton avoids the staggered card-by-card placeholder layout,
 * which makes the initial dashboard load feel faster and keeps the feed width
 * consistent across loading states.
 */
export function DashboardFeedListSkeleton() {
  return (
    <DashboardSurfaceSkeleton
      containerClassName="relative mx-auto w-full max-w-3xl px-1 lg:max-w-none lg:px-3"
      surfaceClassName="min-h-[32rem] rounded-[1.25rem] border border-border/50 bg-card/45 p-3 lg:min-h-[40rem] lg:p-4"
    >
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            className="rounded-[1rem] border border-border/35 bg-background/35 p-3"
            key={index}
          >
            <div className="flex items-center gap-2">
              <Skeleton className="h-3 w-16 rounded-full" />
              <Skeleton className="size-1 rounded-full" />
              <Skeleton className="h-3 w-24 rounded-full" />
              <div className="ml-auto flex items-center gap-1.5">
                <Skeleton className="size-6 rounded-md" />
                <Skeleton className="size-6 rounded-md" />
              </div>
            </div>
            <div className="mt-3 space-y-2">
              <Skeleton className="h-4 w-[92%] rounded-full" />
              <Skeleton className="h-4 w-[74%] rounded-full" />
            </div>
            <div className="mt-3 space-y-2">
              <Skeleton className="h-3 w-full rounded-full" />
              <Skeleton className="h-3 w-[88%] rounded-full" />
            </div>
          </div>
        ))}
      </div>
    </DashboardSurfaceSkeleton>
  );
}

/**
 * Shared sidebar loading surface used by both the route shell and live sidebar.
 *
 * Rendering a single block keeps the sidebar visually aligned with the feed
 * surface while reducing mount-time work versus many small placeholder rows.
 */
export function DashboardSidebarSkeleton() {
  return (
    <DashboardSurfaceSkeleton
      containerClassName="h-full min-h-[28rem] px-2 py-2"
      surfaceClassName="h-full rounded-xl border border-border/50 bg-card/45 p-3"
    >
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, groupIndex) => (
          <div className="space-y-2" key={groupIndex}>
            <Skeleton className="h-4 w-18 rounded-full" />
            <div className="space-y-1.5">
              {Array.from({ length: groupIndex + 2 }).map((__, rowIndex) => (
                <div
                  className="rounded-lg border border-border/30 bg-background/30 px-2.5 py-2"
                  key={rowIndex}
                >
                  <Skeleton
                    className={cn(
                      "h-3.5 rounded-full",
                      rowIndex % 2 === 0 ? "w-[78%]" : "w-[64%]",
                    )}
                  />
                  <Skeleton
                    className={cn(
                      "mt-1.5 h-2.5 rounded-full",
                      rowIndex % 2 === 0 ? "w-[52%]" : "w-[44%]",
                    )}
                  />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </DashboardSurfaceSkeleton>
  );
}

/** Shared top-bar loading skeleton aligned with the dashboard filter strip. */
export function DashboardTopBarSkeleton() {
  return (
    <DashboardSurfaceSkeleton
      containerClassName="w-full px-2 lg:px-4"
      surfaceClassName="rounded-xl"
    >
      <Skeleton className="h-10 rounded-xl" />
    </DashboardSurfaceSkeleton>
  );
}

/** Renders a single shared skeleton block within a dashboard surface wrapper. */
function DashboardSurfaceSkeleton({
  children,
  containerClassName,
  surfaceClassName,
}: DashboardSurfaceSkeletonProps) {
  return (
    <div className={containerClassName}>
      <div className={cn("w-full", surfaceClassName)}>{children}</div>
    </div>
  );
}
