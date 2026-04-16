import { fireEvent, render } from "@testing-library/react";
import { describe, expect, mock, test } from "bun:test";

function createCategory(
  key: string,
  label: string,
  children: { key: string; label: string }[] = [],
) {
  return {
    children,
    key,
    label,
  };
}

describe("DashboardSidebarContent", () => {
  test("renders the sidebar skeleton structure while categories are loading", async () => {
    const { DashboardSidebarSkeleton } =
      await import("@/app/dashboard/dashboard-components/layout");
    const { container } = render(<DashboardSidebarSkeleton />);

    expect(
      container.querySelector('[data-dashboard-sidebar-skeleton="true"]'),
    ).toBeTruthy();
    expect(
      container.querySelectorAll(
        '[data-dashboard-sidebar-skeleton-row="true"]',
      ),
    ).toHaveLength(6);
  });

  test("renders the empty sidebar state when no categories are available", async () => {
    const { DashboardSidebarContent } =
      await import("@/app/dashboard/dashboard-components/layout");
    const { getByText } = render(
      <DashboardSidebarContent
        isCategoriesLoading={false}
        isSidebarVisible={true}
        onCategoryClick={() => {}}
        onCategoryPrefetch={() => {}}
        onFeedClick={() => {}}
        onFeedPrefetch={() => {}}
        selectedCategory="all"
        showFavicons={false}
        sidebarCategories={[]}
      />,
    );

    expect(getByText("No feeds yet")).toBeTruthy();
  });

  test("renders category buttons and feed rows and wires their interactions", async () => {
    const { DashboardSidebarContent } =
      await import("@/app/dashboard/dashboard-components/layout");
    const onCategoryClick = mock(() => {});
    const onCategoryPrefetch = mock(() => {});
    const onFeedClick = mock(() => {});
    const onFeedPrefetch = mock(() => {});
    const sidebarCategories = [
      createCategory("cat-tech", "Tech", [
        createCategory("feed-a", "Feed A"),
        createCategory("feed-b", "Feed B"),
      ]),
    ];

    const { getByRole } = render(
      <DashboardSidebarContent
        isCategoriesLoading={false}
        isSidebarVisible={false}
        onCategoryClick={onCategoryClick}
        onCategoryPrefetch={onCategoryPrefetch}
        onFeedClick={onFeedClick}
        onFeedPrefetch={onFeedPrefetch}
        selectedCategory="feed-b"
        showFavicons={true}
        sidebarCategories={sidebarCategories as never[]}
      />,
    );

    const categoryButton = getByRole("button", { name: "Tech" });
    const firstFeed = getByRole("button", { name: /Feed A/ });
    const secondFeed = getByRole("button", { name: /Feed B/ });

    fireEvent.click(categoryButton);
    fireEvent.focus(categoryButton);
    fireEvent.mouseEnter(categoryButton);
    fireEvent.click(firstFeed);
    fireEvent.focus(secondFeed);
    fireEvent.mouseEnter(secondFeed);

    expect(onCategoryClick).toHaveBeenCalledWith(sidebarCategories[0]);
    expect(onCategoryPrefetch).toHaveBeenCalledTimes(2);
    expect(onFeedClick).toHaveBeenCalledWith(sidebarCategories[0].children[0]);
    expect(onFeedPrefetch).toHaveBeenCalledWith(
      sidebarCategories[0].children[1],
    );
    expect(onFeedPrefetch).toHaveBeenCalledTimes(2);
  });
});
