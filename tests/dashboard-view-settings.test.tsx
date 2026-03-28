import { render } from "@testing-library/react";
import { afterEach, describe, expect, mock, test } from "bun:test";
import * as React from "react";

import { type CategoryTreeNode } from "@/lib";

const dashboardControllerState = {
  feedList: {
    articleFilter: "all" as const,
    articlesPerPage: 12,
    collapsingArticles: new Set<string>(),
    expandedArticleKey: null,
    feedViewKey: "feed-view",
    filteredFeed: [],
    getPreExpandViewportSnapshot: () => null,
    hasConfiguredFeeds: true,
    hydratedArticleLinks: new Set<string>(),
    hydratingArticleLinks: new Set<string>(),
    isCollapseScrollRestoreActive: false,
    isInitialLoading: false,
    isRefreshing: false,
    onArticleExpandedSwipeRead: mock(() => {}),
    onArticlePrepareExpand: mock(() => {}),
    onArticleSwipeRead: mock(() => {}),
    onArticleToggle: mock(() => {}),
    onArticleToggleRead: mock(() => {}),
    onArticleToggleStarred: mock(() => {}),
    refreshEpoch: 0,
    searchTerm: "",
    showFavicons: true,
    updatingArticleState: null,
  },
  filterBar: {
    articleFilter: "all" as const,
    lastRefreshLabel: "just now",
    loading: false,
    setArticleFilter: mock(() => {}),
  },
  settings: {
    articlesPerPage: 12,
    autoRefreshIntervalMinutes: 30,
    backgroundMode: "none" as const,
    categories: [
      {
        children: [],
        key: "category-1",
        label: "News",
      },
    ] satisfies CategoryTreeNode[],
    categoryTree: {
      addCategory: mock(() => true),
      addFeedSource: mock(async () => true),
      importOpmlFeeds: mock(async () => {}),
      moveCategoryByDrop: mock(() => {}),
      moveFeedByDrop: mock(async () => {}),
      pendingCategoryRemovalLabel: null,
      removeCategory: mock(async () => true),
      removeFeedSource: mock(async () => {}),
      renameCategory: mock(async () => true),
      renameFeedSource: mock(async () => true),
      setFeedSourceEnabled: mock(async () => true),
      updateFeedSettings: mock(async () => true),
    },
    distillStrategy: "librerss",
    handleCloseSettings: mock(() => {}),
    onBackgroundModeChange: mock(() => {}),
    onDistillStrategyChange: mock(() => {}),
    selectedCategory: "category-1",
    setArticlesPerPage: mock(() => {}),
    setAutoRefreshIntervalMinutes: mock(() => {}),
    setShowFavicons: mock(() => {}),
    showFavicons: true,
    showSettingsModal: true,
    usePlaceholderData: false,
  },
  sidebar: {
    isMobileSidebarOpen: false,
    isSidebarVisible: true,
    setIsMobileSidebarOpen: mock(() => {}),
    sidebarContentProps: {},
    sidebarScrollRef: { current: null },
  },
};

afterEach(() => {
  mock.restore();
});

describe("DashboardView settings wiring", () => {
  test("renders the tabbed settings panel when settings are open", async () => {
    mock.restore();
    mock.module("@/app/dashboard/hooks/useDashboardController", () => ({
      useDashboardController: () => dashboardControllerState,
    }));
    mock.module("@/app/dashboard/components/DashboardMobileSidebarSheet", () => ({
      DashboardMobileSidebarSheet: () => <div data-testid="mobile-sidebar-sheet" />,
    }));
    mock.module("@/app/dashboard/components/DashboardDesktopSidebar", () => ({
      DashboardDesktopSidebar: () => <div data-testid="desktop-sidebar" />,
    }));
    mock.module("@/app/dashboard/components/DashboardFilterBar", () => ({
      DashboardFilterBar: () => <div data-testid="filter-bar" />,
    }));
    mock.module("@/app/dashboard/components/DashboardScaffold", () => ({
      DashboardFeedViewport: () => <div data-testid="feed-viewport" />,
      DashboardScaffold: ({
        filterBar,
        sidebar,
      }: {
        filterBar: React.ReactNode;
        sidebar: React.ReactNode;
      }) => (
        <div data-testid="dashboard-scaffold">
          {filterBar}
          {sidebar}
        </div>
      ),
    }));
    mock.module("@/app/dashboard/components/settings/SettingsPanel", () => ({
      SettingsPanel: () => <div data-testid="settings-panel" />,
    }));

    const { DashboardView } = await import("@/app/dashboard/DashboardView");
    const { getByTestId } = render(
      <DashboardView
        backgroundMode="none"
        distillStrategy="librerss"
        onBackgroundModeChange={mock(() => {})}
        onDistillStrategyChange={mock(() => {})}
        usePlaceholderData={false}
      />,
    );

    expect(getByTestId("settings-panel")).toBeTruthy();
  });
});