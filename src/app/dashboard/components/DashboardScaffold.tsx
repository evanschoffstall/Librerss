import { ScrollArea } from "@/components/ui/scroll-area";

interface DashboardFeedViewportProps {
  children: React.ReactNode;
}

interface DashboardScaffoldProps {
  feed: React.ReactNode;
  /** When true (default), positions the token bar below the feed on mobile. */
  mobileToolbarBottom?: boolean;
  sidebar: React.ReactNode;
  topBar: React.ReactNode;
}

/**
 * Shared feed viewport chrome for both the live dashboard and route shell.
 *
 * Keeping the Radix viewport wrapper and inner feed frame
 * identical prevents the shell from handing off to a differently sized surface.
 */
export function DashboardFeedViewport({
  children,
}: DashboardFeedViewportProps) {
  return (
    <ScrollArea
      className="
        h-full
        [&_[data-radix-scroll-area-viewport]>div]:block!
        [&_[data-radix-scroll-area-viewport]>div]:w-full!
        [&_[data-radix-scroll-area-viewport]>div]:min-w-0!
      "
    >
      <div
        className="
          mx-auto w-full max-w-3xl min-w-0 px-2 py-1
          lg:max-w-none lg:px-4
        "
        data-dashboard-width-link="feed"
      >
        {children}
      </div>
    </ScrollArea>
  );
}

/**
 * Shared dashboard scaffold for the token bar, sidebar rail, and feed surface.
 *
 * Both the route shell and the hydrated dashboard render through this scaffold
 * so width, spacing, and desktop column sizing stay locked together.
 */
export function DashboardScaffold({
  feed,
  mobileToolbarBottom = true,
  sidebar,
  topBar,
}: DashboardScaffoldProps) {
  return (
    <div
      className={
        mobileToolbarBottom
          ? `
            mx-auto flex h-full max-w-6xl flex-col overflow-hidden px-4
            pt-[env(safe-area-inset-top)]
            pb-[calc(env(safe-area-inset-bottom)+3.8rem)]
            md:px-6
            lg:pt-[calc(env(safe-area-inset-top)+3.8rem)]
            lg:pb-[env(safe-area-inset-bottom)]
          `
          : `
            mx-auto flex h-full max-w-6xl flex-col overflow-hidden px-4
            pt-[calc(env(safe-area-inset-top)+3.8rem)]
            pb-[env(safe-area-inset-bottom)]
            md:px-6
          `
      }
    >
      <div
        className={
          mobileToolbarBottom
            ? `
              order-1 shrink-0
              lg:order-0
            `
            : "shrink-0"
        }
      >
        {topBar}
      </div>

      <div
        className="
          flex min-h-0 flex-1 flex-col gap-6 overflow-hidden
          lg:flex-row lg:items-stretch lg:gap-0
        "
      >
        <aside
          className="
            hidden min-h-0 overflow-hidden
            lg:block lg:w-[220px] lg:shrink-0
          "
        >
          <div className="h-full rounded-xl bg-card/35 p-2">{sidebar}</div>
        </aside>

        <section
          className="
            min-h-0 flex-1 overflow-hidden
            lg:min-w-0
          "
        >
          {feed}
        </section>
      </div>
    </div>
  );
}
