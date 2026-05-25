import { render } from "@testing-library/react";
import { describe, expect, test } from "bun:test";
import { createRef } from "react";

import { DashboardDesktopSidebar } from "@/app/dashboard/components/layout/DashboardDesktopSidebar";

const sidebarContentProps = {
  isCategoriesLoading: true,
  isSidebarVisible: true,
  onCategoryClick: () => {},
  onCategoryPrefetch: () => {},
  onFeedClick: () => {},
  onFeedPrefetch: () => {},
  selectedCategory: "system-all-feeds",
  showFavicons: true,
  sidebarCategories: [],
};

describe("dashboard desktop sidebar", () => {
  test("renders the loading sidebar content inside the scroll area", () => {
    const sidebarScrollRef = createRef<HTMLDivElement>();

    const { container } = render(
      <DashboardDesktopSidebar
        isSidebarVisible={false}
        sidebarContentProps={sidebarContentProps}
        sidebarScrollRef={sidebarScrollRef}
      />,
    );

    expect(
      container.querySelector('[data-dashboard-sidebar-skeleton="true"]'),
    ).not.toBeNull();
    expect(
      container.querySelectorAll('[data-dashboard-sidebar-skeleton-row="true"]')
        .length,
    ).toBeGreaterThan(0);
  });
});
