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
});
