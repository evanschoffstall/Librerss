import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { toast } from "sonner";

import { useDashboardInitialization } from "@/app/dashboard/hooks/useDashboardInitialization";
import { useSettingsFeedState } from "@/app/dashboard/hooks/useSettingsFeedState";
import { useSettingsModalState } from "@/app/dashboard/hooks/useSettingsModalState";
import { useSettingsOpmlImportState } from "@/app/dashboard/hooks/useSettingsOpmlImportState";
import {
  buildDashboardControllerState,
  buildDashboardSidebarContentProps,
} from "@/app/dashboard/services/dashboard-controller-state";
import { type CategoryTreeNode } from "@/lib";

const originalToastError = toast.error;

beforeEach(() => {
  toast.error = mock(() => "") as typeof toast.error;
});

afterEach(() => {
  mock.restore();
  toast.error = originalToastError;
});

describe("dashboard support hooks", () => {
  test("buildDashboardControllerState and buildDashboardSidebarContentProps return the grouped contracts unchanged", () => {
    const sidebarContentProps = buildDashboardSidebarContentProps({
      isCategoriesLoading: false,
      isSidebarVisible: true,
      onCategoryClick: mock(() => {}),
      onCategoryPrefetch: mock(() => {}),
      onFeedClick: mock(() => {}),
      onFeedPrefetch: mock(() => {}),
      selectedCategory: "feed-1",
      showFavicons: true,
      sidebarCategories: [createCategory("News")],
    });
    const controllerState = buildDashboardControllerState({
      feedList: {
        animatingInArticleKeys: new Set<string>(),
        articleFilter: "all",
        articlesPerPage: 12,
        canLoadMoreFromServer: true,
        collapsingArticles: {},
        expandedArticleKey: null,
        feedViewKey: "feed-1:all",
        filteredFeed: [],
        hasConfiguredFeeds: true,
        hydratedArticleLinks: {},
        hydratingArticleLinks: {},
        isCollapseScrollRestoreActive: false,
        isInitialLoading: false,
        isLoadingMore: false,
        isRefreshing: false,
        loadingMoreArticleCount: 0,
        onArticleEnteringDone: mock(() => {}),
        onArticleExpandedSwipeRead: mock(() => {}),
        onArticlePrepareExpand: mock(() => {}),
        onArticleSwipeRead: mock(() => {}),
        onArticleToggle: mock(() => {}),
        onArticleToggleRead: mock(() => {}),
        onArticleToggleStarred: mock(() => {}),
        refreshEpoch: 1,
        searchTerm: "",
        showFavicons: true,
        updatingArticleState: {},
      },
      filterBar: {
        articleFilter: "all",
        isShellLoading: false,
        lastRefreshLabel: "never",
        loading: false,
        setArticleFilter: mock(() => {}),
      },
      settings: {
        articlesPerPage: 12,
        autoRefreshIntervalMinutes: 15,
        backgroundMode: "none",
        categories: [createCategory("News")],
        categoryTree: { customCategoryLabels: [] },
        distillStrategy: "readability",
        handleCloseSettings: mock(() => {}),
        onBackgroundModeChange: mock(() => {}),
        onDistillStrategyChange: mock(() => {}),
        selectedCategory: "feed-1",
        setArticlesPerPage: mock(() => {}),
        setAutoRefreshIntervalMinutes: mock(() => {}),
        setShowFavicons: mock(() => {}),
        showFavicons: true,
        showSettingsModal: false,
        usePlaceholderData: false,
      },
      sidebar: {
        isMobileSidebarOpen: false,
        isSidebarVisible: true,
        setIsMobileSidebarOpen: mock(() => {}),
        sidebarContentProps,
        sidebarScrollRef: { current: null },
      },
    });

    expect(controllerState.sidebar.sidebarContentProps).toBe(sidebarContentProps);
    expect(controllerState.feedList.feedViewKey).toBe("feed-1:all");
    expect(controllerState.settings.backgroundMode).toBe("none");
  });

  test("useDashboardInitialization runs the boot selection only once", async () => {
    const hasInitializedDashboardRef = { current: false };
    const fetchAllFeeds = mock(async () => {});
    const fetchCategoryFeeds = mock(async () => {});
    const fetchFeed = mock(async () => {});
    const loadFeedSources = mock(async () => []);

    const { rerender } = renderHook(
      ({ selectedCategory }) =>
        useDashboardInitialization({
          fetchAllFeeds,
          fetchCategoryFeeds,
          fetchFeed,
          hasInitializedDashboardRef,
          loadFeedSources,
          selectedCategory,
          setIsCategoriesLoading: mock(() => {}),
          setSelectedCategory: mock(() => {}),
        }),
      { initialProps: { selectedCategory: "all-feeds" } },
    );

    await waitFor(() => {
      expect(loadFeedSources).toHaveBeenCalledTimes(1);
    });

    rerender({ selectedCategory: "feed-1" });

    expect(hasInitializedDashboardRef.current).toBe(true);
    expect(loadFeedSources).toHaveBeenCalledTimes(1);
  });

  test("useDashboardInitialization does nothing when the dashboard was already initialized", async () => {
    const loadFeedSources = mock(async () => []);

    renderHook(() =>
      useDashboardInitialization({
        fetchAllFeeds: mock(async () => {}),
        fetchCategoryFeeds: mock(async () => {}),
        fetchFeed: mock(async () => {}),
        hasInitializedDashboardRef: { current: true },
        loadFeedSources,
        selectedCategory: "feed-1",
        setIsCategoriesLoading: mock(() => {}),
        setSelectedCategory: mock(() => {}),
      }),
    );

    await waitFor(() => {
      expect(loadFeedSources).not.toHaveBeenCalled();
    });
  });

  test("useSettingsOpmlImportState imports parsed entries and resets the input value", async () => {
    const onImportOpml = mock(async () => {});
    const { result } = renderHook(() => useSettingsOpmlImportState({ onImportOpml }));
    const input = document.createElement("input");
    input.value = "filled";
    const file = new File(
      [
        `<?xml version="1.0"?><opml version="2.0"><body><outline text="News"><outline text="Feed" xmlUrl="https://example.com/feed.xml" /></outline></body></opml>`,
      ],
      "feeds.opml",
      { type: "text/xml" },
    );

    await act(async () => {
      await result.current.handleOpmlFileChange({
        currentTarget: input,
        target: { files: [file] },
      } as unknown as React.ChangeEvent<HTMLInputElement>);
    });

    expect(onImportOpml).toHaveBeenCalledWith([
      {
        category: "News",
        name: "Feed",
        url: "https://example.com/feed.xml",
      },
    ]);
    expect(input.value).toBe("");
    expect(result.current.isImportingOpml).toBe(false);
  });

  test("useSettingsOpmlImportState reports invalid or unreadable OPML files", async () => {
    const onImportOpml = mock(async () => {});
    const { result } = renderHook(() => useSettingsOpmlImportState({ onImportOpml }));
    const input = document.createElement("input");

    await act(async () => {
      await result.current.handleOpmlFileChange({
        currentTarget: input,
        target: {
          files: [
            {
              text: async () => "not valid opml",
            },
          ],
        },
      } as unknown as React.ChangeEvent<HTMLInputElement>);
    });

    expect(onImportOpml).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalled();
  });

  test("useSettingsOpmlImportState ignores empty file selections", async () => {
    const onImportOpml = mock(async () => {});
    const { result } = renderHook(() => useSettingsOpmlImportState({ onImportOpml }));
    const input = document.createElement("input");
    input.value = "filled";

    await act(async () => {
      await result.current.handleOpmlFileChange({
        currentTarget: input,
        target: { files: [] },
      } as unknown as React.ChangeEvent<HTMLInputElement>);
    });

    expect(onImportOpml).not.toHaveBeenCalled();
    expect(input.value).toBe("");
    expect(toast.error).not.toHaveBeenCalled();
  });

  test("useSettingsOpmlImportState reports when parsed OPML has no valid feed entries", async () => {
    const onImportOpml = mock(async () => {});
    const { result } = renderHook(() => useSettingsOpmlImportState({ onImportOpml }));
    const input = document.createElement("input");

    await act(async () => {
      await result.current.handleOpmlFileChange({
        currentTarget: input,
        target: {
          files: [
            {
              text: async () =>
                `<?xml version="1.0"?><opml version="2.0"><body><outline text="Broken" xmlUrl="ftp://example.com/feed" /></body></opml>`,
            },
          ],
        },
      } as unknown as React.ChangeEvent<HTMLInputElement>);
    });

    expect(onImportOpml).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith(
      "No valid feeds found in this OPML file.",
    );
    expect(result.current.isImportingOpml).toBe(false);
  });

  test("useSettingsFeedState exposes both feed editing and OPML import controls", async () => {
    const onAddFeed = mock(async () => true);
    const onImportOpml = mock(async () => {});
    const { result } = renderHook(() =>
      useSettingsFeedState({
        categories: [createCategory("News", [createFeed("feed-1")])],
        onAddFeed,
        onDropCategory: mock(async () => {}),
        onDropFeed: mock(async () => {}),
        onImportOpml,
        onRemoveFeed: mock(async () => {}),
        onRenameFeed: mock(async () => true),
        onSetFeedEnabled: mock(async () => true),
        onUpdateFeedSettings: mock(async () => true),
        selectedCategory: "cat-news",
      }),
    );

    act(() => {
      result.current.onToggleAddFeed("News");
      result.current.setNewFeedName("Example Feed");
      result.current.setNewFeedUrl("https://example.com/feed.xml");
    });

    await act(async () => {
      await result.current.handleAddFeed("News");
    });

    expect(onAddFeed).toHaveBeenCalledWith(
      "Example Feed",
      "https://example.com/feed.xml",
      "News",
    );
    expect(result.current.opmlInputRef.current).toBeNull();
  });

  test("useSettingsModalState combines category and feed handlers in one surface contract", async () => {
    const onAddCategory = mock(() => true);
    const onAddFeed = mock(async () => true);
    const { result } = renderHook(() =>
      useSettingsModalState({
        categories: [createCategory("News", [createFeed("feed-1")])],
        onAddCategory,
        onAddFeed,
        onDropCategory: mock(async () => {}),
        onDropFeed: mock(async () => {}),
        onImportOpml: mock(async () => {}),
        onRemoveFeed: mock(async () => {}),
        onRenameCategory: mock(async () => true),
        onRenameFeed: mock(async () => true),
        onSetFeedEnabled: mock(async () => true),
        onUpdateFeedSettings: mock(async () => true),
        selectedCategory: "cat-news",
      }),
    );

    act(() => {
      result.current.setNewCategoryName("Science");
    });

    act(() => {
      result.current.handleAddCategory();
      result.current.onToggleAddFeed("News");
      result.current.setNewFeedName("Example Feed");
      result.current.setNewFeedUrl("https://example.com/feed.xml");
    });

    await act(async () => {
      await result.current.handleAddFeed("News");
    });

    expect(onAddCategory).toHaveBeenCalledWith("Science");
    expect(onAddFeed).toHaveBeenCalledWith(
      "Example Feed",
      "https://example.com/feed.xml",
      "News",
    );
  });
});

function createCategory(label: string, children: CategoryTreeNode[] = []): CategoryTreeNode {
  return {
    children,
    key: `cat-${label.toLowerCase()}`,
    label,
  };
}

function createFeed(key: string): CategoryTreeNode {
  return {
    children: [],
    data: {
      enabled: true,
      url: `https://example.com/${key}.xml`,
    },
    key,
    label: `Feed ${key}`,
  };
}