import { render } from "@testing-library/react";
import { describe, expect, test } from "bun:test";

import { DashboardFilterBarSkeleton } from "@/app/dashboard/components/DashboardFilterBar";
import {
  DashboardFeedViewport,
  DashboardScaffold,
} from "@/app/dashboard/components/DashboardScaffold";
import { DashboardSidebarSkeleton } from "@/app/dashboard/components/DashboardSidebarContent";
import { FeedListSkeleton } from "@/app/dashboard/components/feed/FeedListSkeleton";
import { ScrollArea } from "@/components/ui/scroll-area";

/** Constructs the same shell skeleton composition used by page.tsx and DashboardRouter. */
function DashboardShellSkeleton() {
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
        <DashboardScaffold
          feed={
            <DashboardFeedViewport>
              <FeedListSkeleton />
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
    expect(container.querySelector(".max-w-6xl")).toBeTruthy();
    expect(container.querySelectorAll('[class*="bg-card/35"]')).toHaveLength(1);
    expect(
      container.querySelector('[data-dashboard-filter-bar-skeleton="true"]'),
    ).toBeTruthy();
    expect(
      container.querySelectorAll(
        '[data-dashboard-filter-bar-chip-skeleton="true"]',
      ),
    ).toHaveLength(4);
    expect(
      container.querySelectorAll('[data-dashboard-article-skeleton="true"]'),
    ).toHaveLength(4);
    expect(
      container.querySelectorAll(
        '[data-dashboard-sidebar-skeleton-row="true"]',
      ),
    ).toHaveLength(6);
  });

  test("does not stack a second scaffold inset above the first article skeleton", () => {
    const { container } = render(<DashboardShellSkeleton />);

    expect(
      container.querySelectorAll(
        '[class*="pt-[calc(env(safe-area-inset-top)+3.8rem)]"]',
      ),
    ).toHaveLength(1);
  });

  test("shared dashboard skeleton surfaces do not start with a vertical translate", () => {
    const { container } = render(<DashboardShellSkeleton />);

    const feedListSkeleton = container.querySelector<HTMLElement>(
      '[data-dashboard-feed-list-skeleton="true"]',
    );
    const firstArticleSkeleton = container.querySelector<HTMLElement>(
      '[data-dashboard-feed-list-skeleton-item="true"]',
    );
    const filterBarSkeletonSurface = container.querySelector<HTMLElement>(
      '[data-dashboard-filter-bar-surface="true"]',
    );
    const sidebarSkeleton = container.querySelector<HTMLElement>(
      '[data-dashboard-sidebar-skeleton="true"]',
    );

    expect(feedListSkeleton?.style.transform ?? "").not.toContain("translateY");
    expect(firstArticleSkeleton?.style.transform ?? "").not.toContain(
      "translateY",
    );
    expect(filterBarSkeletonSurface?.style.transform ?? "").not.toContain(
      "translateY",
    );
    expect(sidebarSkeleton?.style.transform ?? "").not.toContain(
      "translateY",
    );
    expect(feedListSkeleton?.className ?? "").toContain("max-w-3xl");
    expect(feedListSkeleton?.className ?? "").toContain("lg:max-w-none");
    expect(filterBarSkeletonSurface?.className ?? "").toContain("max-w-3xl");
    expect(filterBarSkeletonSurface?.className ?? "").toContain(
      "lg:max-w-none",
    );
  });
});
