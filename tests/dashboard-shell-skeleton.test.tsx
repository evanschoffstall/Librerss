import { render } from "@testing-library/react";
import { describe, expect, test } from "bun:test";

import { DashboardShellSkeleton } from "@/app/dashboard/components/DashboardShellSkeleton";

describe("DashboardShellSkeleton", () => {
  test("matches the full dashboard shell width while loading", () => {
    const { container, getByLabelText } = render(<DashboardShellSkeleton />);

    expect(getByLabelText("Loading dashboard").getAttribute("aria-busy")).toBe(
      "true",
    );
    expect(container.querySelector(".max-w-6xl")).toBeTruthy();
    expect(container.querySelectorAll('[class*="bg-card/35"]')).toHaveLength(1);
    expect(
      container.querySelector('[data-dashboard-top-bar-skeleton="true"]'),
    ).toBeTruthy();
    expect(
      container.querySelectorAll(
        '[data-dashboard-top-bar-filter-skeleton="true"]',
      ),
    ).toHaveLength(4);
    expect(
      container.querySelector('[data-dashboard-pull-sentinel-skeleton="true"]'),
    ).toBeTruthy();
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
    const topBarSkeletonSurface = container.querySelector<HTMLElement>(
      '[data-dashboard-top-bar-skeleton-surface="true"]',
    );
    const sidebarSkeleton = container.querySelector<HTMLElement>(
      '[data-dashboard-sidebar-skeleton="true"]',
    );

    expect(feedListSkeleton?.style.transform ?? "").not.toContain("translateY");
    expect(firstArticleSkeleton?.style.transform ?? "").not.toContain(
      "translateY",
    );
    expect(topBarSkeletonSurface?.style.transform ?? "").not.toContain(
      "translateY",
    );
    expect(sidebarSkeleton?.style.transform ?? "").not.toContain(
      "translateY",
    );
  });
});
