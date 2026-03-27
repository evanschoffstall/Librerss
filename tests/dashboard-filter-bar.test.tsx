import { render } from "@testing-library/react";
import { describe, expect, test } from "bun:test";

import { DashboardFilterBar } from "@/app/dashboard/components/DashboardFilterBar";
import { DashboardFeedViewport } from "@/app/dashboard/components/DashboardScaffold";

describe("DashboardFilterBar", () => {
  test("shares the feed-width CSS contract with the article viewport", () => {
    const { container } = render(
      <>
        <DashboardFilterBar
          articleFilter="unread"
          lastRefreshLabel="just now"
          loading={false}
          onArticleFilterChange={() => {}}
        />
        <DashboardFeedViewport>
          <div>Feed</div>
        </DashboardFeedViewport>
      </>,
    );

    const linkedWidthSurfaces = container.querySelectorAll(
      '[data-dashboard-width-link="feed"]',
    );

    expect(linkedWidthSurfaces).toHaveLength(2);
  });

  test("shows the Motion spinner while the refresh label is skeletoning", () => {
    const { container, getByLabelText, queryByText, rerender } = render(
      <DashboardFilterBar
        articleFilter="unread"
        lastRefreshLabel="just now"
        loading
        onArticleFilterChange={() => {}}
      />,
    );

    const loadingIcon = container.querySelector("span[aria-live='polite'] svg");
    expect(loadingIcon).toBeTruthy();
    expect(loadingIcon?.getAttribute("class")).toContain(
      "lucide-loader-circle",
    );
    expect(getByLabelText("Refreshing")).toBeTruthy();
    expect(queryByText("just now")).toBeNull();

    rerender(
      <DashboardFilterBar
        articleFilter="unread"
        lastRefreshLabel="just now"
        loading={false}
        onArticleFilterChange={() => {}}
      />,
    );

    const idleIcon = container.querySelector("span[aria-live='polite'] svg");
    expect(idleIcon).toBeTruthy();
    expect(idleIcon?.getAttribute("class")).toContain("lucide-refresh-cw");
  });
});