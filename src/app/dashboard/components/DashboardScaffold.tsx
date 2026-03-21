import type { ComponentPropsWithRef } from "react";

import { ScrollArea } from "@/components/ui/scroll-area";

interface DashboardFeedViewportProps {
  children: React.ReactNode;
  scrollAreaRef?: ComponentPropsWithRef<typeof ScrollArea>["ref"];
}

interface DashboardScaffoldProps {
  feed: React.ReactNode;
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
  scrollAreaRef,
}: DashboardFeedViewportProps) {
  return (
    <ScrollArea
      className="
        h-full
        [&_[data-radix-scroll-area-viewport]>div]:block!
        [&_[data-radix-scroll-area-viewport]>div]:w-full!
        [&_[data-radix-scroll-area-viewport]>div]:min-w-0!
      "
      ref={scrollAreaRef}
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
  sidebar,
  topBar,
}: DashboardScaffoldProps) {
  return (
    <div
      className="
        mx-auto flex h-full max-w-6xl flex-col overflow-hidden px-4
        pt-[calc(env(safe-area-inset-top)+3.8rem)]
        pb-[env(safe-area-inset-bottom)]
        md:px-6
      "
    >
      {topBar}

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
