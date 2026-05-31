import { act, render, waitFor } from "@testing-library/react";
import { describe, expect, test } from "bun:test";

import { DashboardToolbarSkeleton } from "@/app/dashboard/components";
import { FEED_ROW_GAP_PX } from "@/app/dashboard/components/feed-config";
import { FeedListSkeleton } from "@/app/dashboard/components/feed-view";
import { FeedLoadMoreSkeletonBlock } from "@/app/dashboard/components/feed-view/FeedListSkeleton";
import {
  DashboardFeedViewport,
  DashboardFilterBarSkeleton,
  DashboardScaffold,
  DashboardSidebarSkeleton,
} from "@/app/dashboard/components/layout";
import { ScrollArea } from "@/components/ui/scroll-area";

/** Constructs the same shell skeleton composition used by page.tsx and DashboardRouter. */
function DashboardShellSkeleton({
  isInvertedScroll = false,
}: {
  isInvertedScroll?: boolean;
}) {
  return (
    <main
      aria-busy="true"
      aria-label="Loading dashboard"
      className="h-full overflow-hidden bg-background"
    >
      <div className="relative h-full overflow-hidden">
        <div
          aria-hidden="true"
          className="
            pointer-events-none absolute top-1/2 size-64 -translate-y-1/2
            rounded-full bg-primary/5 blur-3xl
          "
        />
        <DashboardToolbarSkeleton
          isDevelopmentMode={true}
          mobileToolbarBottom={true}
          mobileToolbarMirror={true}
        />
        <DashboardScaffold
          feed={
            <DashboardFeedViewport>
              <FeedListSkeleton isInvertedScroll={isInvertedScroll} />
            </DashboardFeedViewport>
          }
          filterBar={<DashboardFilterBarSkeleton />}
          sidebar={
            <ScrollArea className="h-full">
              <DashboardSidebarSkeleton />
            </ScrollArea>
          }
        />
      </div>
    </main>
  );
}

describe("DashboardShellSkeleton", () => {
  test("matches the full dashboard shell width while loading", () => {
    const { container, getByLabelText } = render(<DashboardShellSkeleton />);

    expect(getByLabelText("Loading dashboard").getAttribute("aria-busy")).toBe(
      "true",
    );
    expect(
      container.querySelector('[data-dashboard-toolbar-skeleton="true"]'),
    ).toBeTruthy();
    expect(
      container.querySelectorAll(
        '[data-dashboard-toolbar-skeleton-action="true"]',
      ),
    ).toHaveLength(13);
    expect(container.querySelector(".max-w-6xl")).toBeTruthy();
    expect(container.querySelectorAll('[class*="bg-card/35"]')).toHaveLength(1);
    expect(
      container.querySelector('[data-dashboard-filter-bar-skeleton="true"]'),
    ).toBeTruthy();
    expect(
      container.querySelectorAll(
        '[data-dashboard-filter-bar-chip-skeleton="true"]',
      ),
    ).toHaveLength(5);
    expect(
      container.querySelectorAll('[data-dashboard-article-skeleton="true"]'),
    ).toHaveLength(5);
    expect(
      container.querySelectorAll(
        '[data-dashboard-sidebar-skeleton-row="true"]',
      ),
    ).toHaveLength(6);
    expect(
      container.querySelectorAll(
        '[data-dashboard-sidebar-skeleton-category="true"]',
      ),
    ).toHaveLength(4);
  });

  test("does not stack a second scaffold inset above the first article skeleton", () => {
    const { container } = render(<DashboardShellSkeleton />);

    expect(container.querySelectorAll('[class*="sm:pt-14"]')).toHaveLength(0);
  });

  test("uses the hydrated article row gap for dashboard shell skeleton rows", () => {
    const { container } = render(<DashboardShellSkeleton />);

    const feedListSkeleton = container.querySelector<HTMLElement>(
      '[data-dashboard-feed-list-skeleton="true"]',
    );

    expect(feedListSkeleton?.className ?? "").not.toContain("gap-1.5");
  });

  test("uses the hydrated collapsed article title footprint for skeleton titles", () => {
    const { container } = render(<DashboardShellSkeleton />);

    const titleBlock = container.querySelector<HTMLElement>(
      '[data-dashboard-article-skeleton-title-block="true"]',
    );
    const titleLine = container.querySelector<HTMLElement>(
      '[data-dashboard-article-skeleton-title-line="true"]',
    );

    expect(titleBlock).toBeNull();
    expect(titleLine?.className ?? "").toContain("h-6");
  });

  test("uses the hydrated article row gap for pagination skeleton rows", () => {
    const { container } = render(
      <FeedLoadMoreSkeletonBlock
        count={4}
        placement="after-articles"
        visible
      />,
    );

    const loadMoreSkeletons = container.querySelector<HTMLElement>(
      '[data-feed-load-more-skeletons="true"]',
    );
    const firstSkeletonRow = container.querySelector<HTMLElement>(
      '[data-dashboard-feed-list-skeleton-item="true"]',
    );

    expect(loadMoreSkeletons?.className ?? "").not.toContain("gap-1.5");
    expect(
      Number.parseFloat(firstSkeletonRow?.style.marginBottom ?? "0"),
    ).toBeCloseTo(FEED_ROW_GAP_PX - 1 / 3, 5);
    expect(
      container.querySelectorAll(
        '[data-dashboard-feed-list-skeleton-item="true"]',
      ),
    ).toHaveLength(4);
  });

  test("shared dashboard skeleton surfaces do not start with a vertical translate", () => {
    const { container } = render(<DashboardShellSkeleton />);

    const feedListSkeleton = container.querySelector<HTMLElement>(
      '[data-dashboard-feed-list-skeleton="true"]',
    );
    const firstArticleSkeleton = container.querySelector<HTMLElement>(
      '[data-dashboard-feed-list-skeleton-item="true"]',
    );
    const filterBarSkeletonWidthOwner = container.querySelector<HTMLElement>(
      '[data-dashboard-filter-bar-skeleton="true"] [data-dashboard-width-link="feed"]',
    );
    const sidebarSkeleton = container.querySelector<HTMLElement>(
      '[data-dashboard-sidebar-skeleton="true"]',
    );

    expect(feedListSkeleton?.style.transform ?? "").not.toContain("translateY");
    expect(firstArticleSkeleton?.style.transform ?? "").not.toContain(
      "translateY",
    );
    expect(filterBarSkeletonWidthOwner?.style.transform ?? "").not.toContain(
      "translateY",
    );
    expect(sidebarSkeleton?.style.transform ?? "").not.toContain("translateY");
    expect(feedListSkeleton?.className ?? "").toContain("max-w-3xl");
    expect(feedListSkeleton?.className ?? "").toContain("lg:max-w-none");
    expect(filterBarSkeletonWidthOwner?.className ?? "").toContain("max-w-3xl");
    expect(filterBarSkeletonWidthOwner?.className ?? "").toContain(
      "lg:max-w-none",
    );
  });

  test("sizes the article skeleton count to fill the feed viewport plus one hidden overflow row", async () => {
    const { container } = render(<DashboardShellSkeleton />);

    const viewport = container.querySelector<HTMLElement>(
      '[data-feed-scroll-viewport="true"]',
    );
    const feedListSkeleton = container.querySelector<HTMLElement>(
      '[data-dashboard-feed-list-skeleton="true"]',
    );
    const firstArticleSkeleton = container.querySelector<HTMLElement>(
      '[data-dashboard-feed-list-skeleton-item="true"]',
    );

    expect(viewport).toBeTruthy();
    expect(feedListSkeleton).toBeTruthy();
    expect(firstArticleSkeleton).toBeTruthy();

    Object.defineProperty(viewport!, "clientHeight", {
      configurable: true,
      get() {
        return 377;
      },
    });
    feedListSkeleton!.style.rowGap = "6px";
    firstArticleSkeleton!.getBoundingClientRect = () =>
      ({ height: 120 }) as DOMRect;

    act(() => {
      window.dispatchEvent(new Event("resize"));
    });

    await waitFor(() => {
      expect(
        container.querySelectorAll(
          '[data-dashboard-feed-list-skeleton-item="true"]',
        ),
      ).toHaveLength(4);
    });
    expect(
      feedListSkeleton?.getAttribute("data-dashboard-feed-list-skeleton-count"),
    ).toBe("4");
  });

  test("keeps the default skeleton count when no feed viewport wrapper is present", () => {
    const { container } = render(<FeedListSkeleton />);

    const feedListSkeleton = container.querySelector<HTMLElement>(
      '[data-dashboard-feed-list-skeleton="true"]',
    );

    expect(
      feedListSkeleton?.getAttribute("data-dashboard-feed-list-skeleton-count"),
    ).toBe("5");
    expect(
      container.querySelectorAll(
        '[data-dashboard-feed-list-skeleton-item="true"]',
      ),
    ).toHaveLength(5);
  });

  test("clamps the feed skeleton count to one when the viewport is shorter than one row", async () => {
    const { container } = render(<DashboardShellSkeleton />);

    const viewport = container.querySelector<HTMLElement>(
      '[data-feed-scroll-viewport="true"]',
    );
    const feedListSkeleton = container.querySelector<HTMLElement>(
      '[data-dashboard-feed-list-skeleton="true"]',
    );
    const firstArticleSkeleton = container.querySelector<HTMLElement>(
      '[data-dashboard-feed-list-skeleton-item="true"]',
    );

    expect(viewport).toBeTruthy();
    expect(feedListSkeleton).toBeTruthy();
    expect(firstArticleSkeleton).toBeTruthy();

    Object.defineProperty(viewport!, "clientHeight", {
      configurable: true,
      get() {
        return 40;
      },
    });
    feedListSkeleton!.style.rowGap = "6px";
    firstArticleSkeleton!.getBoundingClientRect = () =>
      ({ height: 120 }) as DOMRect;

    act(() => {
      window.dispatchEvent(new Event("resize"));
    });

    await waitFor(() => {
      expect(
        container.querySelectorAll(
          '[data-dashboard-feed-list-skeleton-item="true"]',
        ),
      ).toHaveLength(1);
    });
    expect(
      feedListSkeleton?.getAttribute("data-dashboard-feed-list-skeleton-count"),
    ).toBe("1");
  });

  test("ignores zero-height skeleton measurements and keeps the fallback count", async () => {
    const { container } = render(<DashboardShellSkeleton />);

    const viewport = container.querySelector<HTMLElement>(
      '[data-feed-scroll-viewport="true"]',
    );
    const feedListSkeleton = container.querySelector<HTMLElement>(
      '[data-dashboard-feed-list-skeleton="true"]',
    );
    const firstArticleSkeleton = container.querySelector<HTMLElement>(
      '[data-dashboard-feed-list-skeleton-item="true"]',
    );

    expect(viewport).toBeTruthy();
    expect(feedListSkeleton).toBeTruthy();
    expect(firstArticleSkeleton).toBeTruthy();

    Object.defineProperty(viewport!, "clientHeight", {
      configurable: true,
      get() {
        return 377;
      },
    });
    firstArticleSkeleton!.getBoundingClientRect = () =>
      ({ height: 0 }) as DOMRect;

    act(() => {
      window.dispatchEvent(new Event("resize"));
    });

    await waitFor(() => {
      expect(
        feedListSkeleton?.getAttribute(
          "data-dashboard-feed-list-skeleton-count",
        ),
      ).toBe("5");
    });
  });

  test("anchors the inverted feed skeleton stack from the viewport bottom", () => {
    const { container } = render(<DashboardShellSkeleton isInvertedScroll />);

    const feedListSkeleton = container.querySelector<HTMLElement>(
      '[data-dashboard-feed-list-skeleton="true"]',
    );

    expect(feedListSkeleton?.className ?? "").toContain("h-full");
    expect(feedListSkeleton?.className ?? "").toContain("max-sm:justify-end");
    expect(feedListSkeleton?.className ?? "").toContain("justify-end");
  });

  test("keeps the feed overlay scrollbar hidden while the initial shell skeleton overflows", async () => {
    const { container } = render(<DashboardShellSkeleton />);

    const viewport = container.querySelector<HTMLElement>(
      '[data-feed-scroll-viewport="true"]',
    );
    const firstArticleSkeleton = container.querySelector<HTMLElement>(
      '[data-dashboard-feed-list-skeleton-item="true"]',
    );

    expect(viewport).toBeTruthy();
    expect(firstArticleSkeleton).toBeTruthy();

    Object.defineProperty(viewport!, "clientHeight", {
      configurable: true,
      get() {
        return 377;
      },
    });
    Object.defineProperty(viewport!, "scrollHeight", {
      configurable: true,
      get() {
        return 498;
      },
    });
    firstArticleSkeleton!.getBoundingClientRect = () =>
      ({ height: 120 }) as DOMRect;

    act(() => {
      window.dispatchEvent(new Event("resize"));
    });

    await waitFor(() => {
      expect(
        container.querySelector('[data-dashboard-feed-scrollbar-thumb="true"]'),
      ).toBeNull();
    });
  });
});
