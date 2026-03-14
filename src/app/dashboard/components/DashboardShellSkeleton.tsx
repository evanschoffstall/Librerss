import {
  DashboardFeedListSkeleton,
  DashboardSidebarSkeleton,
  DashboardTopBarSkeleton,
} from "./DashboardLoadingSurfaces";

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
      <div className="
        relative flex h-full justify-center overflow-hidden px-4
        pt-[calc(env(safe-area-inset-top)+3.8rem)]
        pb-[env(safe-area-inset-bottom)]
        md:px-6
      ">
        <div
          aria-hidden="true"
          className="
            pointer-events-none absolute top-1/2 size-64 -translate-y-1/2
            rounded-full bg-primary/5 blur-3xl
          "
        />
        <div className="
          relative flex size-full max-w-6xl flex-col gap-1 overflow-hidden
        ">
          <div className="shrink-0 py-1">
            <div className="flex items-center gap-0">
              <div className="
                hidden
                lg:block lg:w-[220px] lg:shrink-0
              " />
              <div className="
                flex-1
                lg:min-w-0
              ">
                <DashboardTopBarSkeleton />
              </div>
            </div>
          </div>

          <div className="
            flex min-h-0 flex-1 flex-col gap-6 overflow-hidden
            lg:flex-row lg:items-stretch lg:gap-0
          ">
            <aside className="
              hidden min-h-0 overflow-hidden
              lg:block lg:w-[220px] lg:shrink-0
            ">
              <div className="h-full rounded-xl bg-card/35 p-2">
                <DashboardSidebarSkeleton />
              </div>
            </aside>

            <section className="
              min-h-0 flex-1 overflow-hidden
              lg:min-w-0
            ">
              <DashboardFeedListSkeleton />
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}
