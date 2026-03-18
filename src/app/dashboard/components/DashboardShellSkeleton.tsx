import { ScrollArea } from "@/components/ui/scroll-area";

import {
  DashboardFeedListSkeleton,
  DashboardPullSentinelSkeleton,
  DashboardSidebarSkeleton,
  DashboardTopBarSkeleton,
} from "./DashboardLoadingSurfaces";
import { DashboardFeedViewport, DashboardScaffold } from "./DashboardScaffold";

/**
 * Route-level dashboard loading shell that mirrors the full feed-plus-sidebar layout.
 *
 * The route and session fallbacks render before the hydrated dashboard controller can
 * mount its own article-card skeletons. Matching the dashboard's real max width and
 * desktop column split avoids a visible width jump when the feed surface takes over.
 */
export function DashboardShellSkeleton() {
  return (
    <main
      aria-busy="true"
      aria-label="Loading dashboard"
      className="h-full overflow-hidden bg-background"
    >
      <div
        className="
          relative flex h-full justify-center overflow-hidden px-4
          pt-[calc(env(safe-area-inset-top)+3.8rem)]
          pb-[env(safe-area-inset-bottom)]
          md:px-6
        "
      >
        <div
          aria-hidden="true"
          className="
            pointer-events-none absolute top-1/2 size-64 -translate-y-1/2
            rounded-full bg-primary/5 blur-3xl
          "
        />
        <DashboardScaffold
          feed={
            <DashboardFeedViewport
              pullSentinel={<DashboardPullSentinelSkeleton />}
            >
              <DashboardFeedListSkeleton />
            </DashboardFeedViewport>
          }
          sidebar={
            <ScrollArea className="h-full">
              <DashboardSidebarSkeleton />
            </ScrollArea>
          }
          topBar={<DashboardTopBarSkeleton />}
        />
      </div>
    </main>
  );
}
