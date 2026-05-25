import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

const getDashboardArticleWindowCountsMock = mock();
const useArticleWindowAvailabilityMock = mock();
const useDashboardArticleWindowLoadingStateMock = mock();
const useDashboardArticleWindowLoadMoreMock = mock();
const useDashboardArticleWindowPrefetchMock = mock();
const useResetArticleWindowOnSelectionChangeMock = mock();
const useUnreadWindowRefillMock = mock();

async function loadControllerSectionsModule() {
  return import(
    `@/app/dashboard/hooks/dashboard-controller/useDashboardControllerSections?test=${Date.now()}-${Math.random()}`
  );
}

function setupArticleWindowModule() {
  mock.module(
    "@/app/dashboard/hooks/dashboard-controller/dashboardArticleWindowPaging",
    () => ({
      getDashboardArticleWindowCounts: getDashboardArticleWindowCountsMock,
    }),
  );
  mock.module(
    "@/app/dashboard/hooks/dashboard-controller/useDashboardArticleWindowEffects",
    () => ({
      useArticleWindowAvailability: useArticleWindowAvailabilityMock,
      useResetArticleWindowOnSelectionChange:
        useResetArticleWindowOnSelectionChangeMock,
      useUnreadWindowRefill: useUnreadWindowRefillMock,
    }),
  );
  mock.module(
    "@/app/dashboard/hooks/dashboard-controller/useDashboardArticleWindowLoadMore",
    () => ({
      useDashboardArticleWindowLoadMore: useDashboardArticleWindowLoadMoreMock,
    }),
  );
  mock.module(
    "@/app/dashboard/hooks/dashboard-controller/useDashboardArticleWindowPrefetch",
    () => ({
      useDashboardArticleWindowLoadingState:
        useDashboardArticleWindowLoadingStateMock,
      useDashboardArticleWindowPrefetch: useDashboardArticleWindowPrefetchMock,
    }),
  );

  return import(
    `@/app/dashboard/hooks/dashboard-controller/useDashboardArticleWindow?test=${Date.now()}-${Math.random()}`
  );
}

describe("dashboard controller wrapper hooks", () => {
  beforeEach(() => {
    mock.restore();
    for (const fn of [
      getDashboardArticleWindowCountsMock,
      useArticleWindowAvailabilityMock,
      useDashboardArticleWindowLoadingStateMock,
      useDashboardArticleWindowLoadMoreMock,
      useDashboardArticleWindowPrefetchMock,
      useResetArticleWindowOnSelectionChangeMock,
      useUnreadWindowRefillMock,
    ]) {
      fn.mockReset();
    }
  });

  afterEach(() => {
    cleanup();
    mock.restore();
  });

  test("tracks animating article keys", async () => {
    const { useDashboardAnimatingArticleState } =
      await loadControllerSectionsModule();
    const { result } = renderHook(() => useDashboardAnimatingArticleState());

    act(() => {
      result.current.handleNewArticlesArrived(new Set(["a", "b"]));
      result.current.handleNewArticlesArrived(new Set());
    });
    expect(Array.from(result.current.animatingInArticleKeys)).toEqual([
      "a",
      "b",
    ]);

    act(() => {
      result.current.handleArticleEnteringDone("a");
      result.current.handleArticleEnteringDone("missing");
    });
    expect(Array.from(result.current.animatingInArticleKeys)).toEqual(["b"]);
  });

  test("derives dashboard feed loading state from loading and search inputs", async () => {
    const { useDashboardFeedLoadingState } =
      await loadControllerSectionsModule();
    const { rerender, result } = renderHook(
      ({
        feedLength,
        isCategoriesLoading,
        loading,
        searchTerm,
      }: {
        feedLength: number;
        isCategoriesLoading: boolean;
        loading: boolean;
        searchTerm: string;
      }) =>
        useDashboardFeedLoadingState({
          articleFilter: "all",
          feedLength,
          isCategoriesLoading,
          loading,
          searchTerm,
          settleMs: 0,
          usePlaceholderData: false,
        }),
      {
        initialProps: {
          feedLength: 0,
          isCategoriesLoading: true,
          loading: true,
          searchTerm: " rss ",
        },
      },
    );

    expect(result.current.isFeedListInitialLoading).toBe(true);
    expect(result.current.isFeedListRefreshing).toBe(false);
    expect(result.current.shouldUseArticleWindow).toBe(false);

    rerender({
      feedLength: 5,
      isCategoriesLoading: false,
      loading: true,
      searchTerm: "",
    });

    expect(result.current.isFeedListInitialLoading).toBe(false);
    expect(result.current.shouldUseArticleWindow).toBe(true);
    await waitFor(() => {
      expect(result.current.isFeedListRefreshing).toBe(true);
    });
  });

  test("composes the dashboard article window lifecycle and controls", async () => {
    const handleLoadMoreArticles = mock();
    const prefetchNextPage = mock(async () => {});
    getDashboardArticleWindowCountsMock.mockReturnValue({
      articleWindowLimit: 30,
      pendingLoadMoreArticleCount: 10,
    });
    useDashboardArticleWindowPrefetchMock.mockReturnValue(prefetchNextPage);
    useDashboardArticleWindowLoadMoreMock.mockReturnValue(
      handleLoadMoreArticles,
    );

    const { useDashboardArticleWindow } = await setupArticleWindowModule();
    const options = {
      articleFilter: "unread",
      articleSortOrder: "newest" as const,
      articlesPerPage: 10,
      currentFeedLength: 8,
      currentFilteredFeedLength: 5,
      fetchAllFeeds: mock(),
      fetchCategoryFeeds: mock(),
      fetchFeed: mock(),
      isCategoriesLoading: false,
      isLoading: true,
      prefetchAllFeeds: mock(),
      prefetchCategoryFeeds: mock(),
      prefetchFeed: mock(),
      selectedCategory: "All",
      selectedCategoryNode: { key: "all", label: "All" },
      selectedFeedUrl: "https://example.com/feed.xml",
      shouldUseArticleWindow: true,
      usePlaceholderData: true,
    };

    const { result } = renderHook(() => useDashboardArticleWindow(options));
    expect(result.current).toEqual({
      articleWindowLimit: 30,
      handleLoadMoreArticles,
      hasMoreServerArticles: true,
      isLoadingMoreArticles: false,
      pendingLoadMoreArticleCount: 10,
      requestedArticleLimit: 10,
    });
    expect(useResetArticleWindowOnSelectionChangeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        articleFilter: "unread",
        articleSortOrder: "newest",
        articlesPerPage: 10,
        selectedCategory: "All",
        shouldUseArticleWindow: true,
      }),
    );
    expect(useDashboardArticleWindowLoadingStateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        isLoading: true,
        shouldUseArticleWindow: true,
      }),
    );
    expect(useArticleWindowAvailabilityMock).toHaveBeenCalledWith(
      expect.objectContaining({
        currentFeedLength: 8,
        requestedArticleLimit: 10,
      }),
    );
    expect(useUnreadWindowRefillMock).toHaveBeenCalledWith(
      expect.objectContaining({
        currentFilteredFeedLength: 5,
        selectedFeedUrl: "https://example.com/feed.xml",
      }),
    );
  });

  test("initializes the article window as disabled when pagination is off", async () => {
    getDashboardArticleWindowCountsMock.mockReturnValue({
      articleWindowLimit: undefined,
      pendingLoadMoreArticleCount: 0,
    });
    useDashboardArticleWindowPrefetchMock.mockReturnValue(mock(async () => {}));
    useDashboardArticleWindowLoadMoreMock.mockReturnValue(mock());

    const { useDashboardArticleWindow } = await setupArticleWindowModule();
    const { result } = renderHook(() =>
      useDashboardArticleWindow({
        articleFilter: "all",
        articleSortOrder: "newest",
        articlesPerPage: 25,
        currentFeedLength: 25,
        currentFilteredFeedLength: 25,
        fetchAllFeeds: mock(),
        fetchCategoryFeeds: mock(),
        fetchFeed: mock(),
        isCategoriesLoading: false,
        isLoading: false,
        prefetchAllFeeds: mock(),
        prefetchCategoryFeeds: mock(),
        prefetchFeed: mock(),
        selectedCategory: "Unread",
        shouldUseArticleWindow: false,
        usePlaceholderData: false,
      }),
    );

    expect(result.current.hasMoreServerArticles).toBe(false);
    expect(result.current.requestedArticleLimit).toBe(25);
  });
});
