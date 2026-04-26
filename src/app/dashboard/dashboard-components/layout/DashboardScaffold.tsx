import { DashboardFeedScrollArea } from "@/app/dashboard/dashboard-components/layout/DashboardFeedScrollArea";
import { DASHBOARD_FEED_WIDTH_CLASS_NAME } from "@/app/dashboard/shared";

/** Shared inner surface spacing for feed-linked dashboard content areas. */
export const DASHBOARD_FEED_SURFACE_CLASS_NAME = `${DASHBOARD_FEED_WIDTH_CLASS_NAME} min-w-0 px-2 lg:px-4`;

/**
 * Describes the props for the dashboard feed viewport component.
 */
interface DashboardFeedViewportProps {
  children: React.ReactNode;
}

/**
 * Describes the props for the dashboard scaffold component.
 */
interface DashboardScaffoldProps {
  feed: React.ReactNode;
  filterBar: React.ReactNode;
  /** When true (default), positions the filter bar below the feed on mobile. */
  mobileToolbarBottom?: boolean;
  sidebar: React.ReactNode;
}

/**
 * Render the dashboard feed viewport component.
 * @param props - The component props.
 * @returns The rendered dashboard feed viewport component.
 */
export function DashboardFeedViewport(props: DashboardFeedViewportProps) {
  const { children } = props;
  return (
    <DashboardFeedScrollArea className="h-full">
      <div
        className={`
          ${DASHBOARD_FEED_SURFACE_CLASS_NAME}
          h-full py-1
        `}
        data-dashboard-width-link="feed"
      >
        {children}
      </div>
    </DashboardFeedScrollArea>
  );
}

/**
 * Render the dashboard scaffold component.
 * @param props - The component props.
 * @returns The rendered dashboard scaffold component.
 */
export function DashboardScaffold(props: DashboardScaffoldProps) {
  const { feed, filterBar, mobileToolbarBottom = true, sidebar } = props;
  return (
    <div
      className={
        mobileToolbarBottom
          ? `
            mx-auto flex h-full max-w-6xl flex-col overflow-hidden px-4
            pt-[env(safe-area-inset-top)]
            pb-[calc(env(safe-area-inset-bottom)+3.8rem)]
            sm:pb-0
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
        {filterBar}
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
