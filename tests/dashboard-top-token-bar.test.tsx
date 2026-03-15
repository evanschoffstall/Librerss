import { describe, expect, test } from "bun:test";

import { render } from "@testing-library/react";

import { DashboardTopTokenBar } from "@/app/dashboard/components/DashboardTopTokenBar";

describe("DashboardTopTokenBar", () => {
  test("shows the Motion spinner while the refresh label is skeletoning", () => {
    const { container, getByLabelText, queryByText, rerender } = render(
      <DashboardTopTokenBar
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
      <DashboardTopTokenBar
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
