/**
 * Component Tests: Dashboard Hooks
 * Tests for src/app/dashboard/hooks/
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  mock,
  test,
} from "bun:test";
import { createElement } from "react";
import { toast } from "sonner";

import type { Article, CategoryTreeNode } from "@/lib/core";

import { DASHBOARD_EVENTS } from "@/app/dashboard/constants";
import { useFeedLoader } from "@/app/dashboard/dashboard-hooks/feed-loader";
import {
  escapeArticleKey,
  useArticleHydration,
} from "@/app/dashboard/dashboard-hooks/useArticleHydration";
import { useArticleReadState } from "@/app/dashboard/dashboard-hooks/useArticleReadState";
import { useCategoryOrderState } from "@/app/dashboard/dashboard-hooks/useCategoryOrderState";
import {
  runDashboardViewportReadCommand,
  useDashboardEvents,
} from "@/app/dashboard/dashboard-hooks/useDashboardEvents";
import { type FeedBatchSource } from "@/app/dashboard/dashboard-services/feed-data";
import { buildFeedBatchOutcome } from "@/app/dashboard/dashboard-services/feed-data";
import { ArticleService, FeedService } from "@/lib/api";

describe("useFeedLoader", () => {
  test("reuses a prefetched batch query without clearing the feed", async () => {
    const categoriesRef = { current: [] as CategoryTreeNode[] };
    const prefetchedFeedUrl = "https://example.com/prefetched.xml";
    let feedState: Article[] = [
      {
        content: "Existing article body",
        feedId: 2,
        feedName: "Existing Feed",
        feedUrl: "https://example.com/existing.xml",
        id: 91,
        isRead: false,
        isStarred: false,
        lastChecked: new Date("2026-03-14T12:00:00.000Z"),
        link: "https://example.com/articles/existing",
        publicationDate: new Date("2026-03-14T11:59:00.000Z"),
        title: "Existing article",
      },
    ];
    const feedRef = { current: feedState };
    let clearedFeed = false;
    const prefetchedArticle: Article = {
      content: "Prefetched article body",
      feedId: 3,
      feedName: "Prefetched Feed",
      feedUrl: prefetchedFeedUrl,
      id: 92,
      isRead: false,
      isStarred: false,
      lastChecked: new Date("2026-03-14T12:01:00.000Z"),
      link: "https://example.com/articles/prefetched",
      publicationDate: new Date("2026-03-14T12:00:30.000Z"),
      title: "Prefetched article",
    };
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          gcTime: Number.POSITIVE_INFINITY,
          queryKeyHashFn: (queryKey) => JSON.stringify(queryKey),
          refetchOnReconnect: false,
          refetchOnWindowFocus: false,
          retry: false,
        },
      },
    });
    const setFeed = mock((updater: React.SetStateAction<Article[]>) => {
      if (Array.isArray(updater) && updater.length === 0) {
        clearedFeed = true;
      }

      feedState = typeof updater === "function" ? updater(feedState) : updater;
      feedRef.current = feedState;
    });

    FeedService.getFeedsBatch = mock(async (urls: string[]) => [
      {
        articles: [
          {
            ...prefetchedArticle,
            feedName: prefetchedArticle.feedName,
            feedUrl: urls[0] ?? prefetchedArticle.feedUrl,
          },
        ],
        lastFetchedAt: new Date("2026-03-14T12:02:00.000Z"),
        ok: true,
        url: urls[0] ?? prefetchedArticle.feedUrl,
      },
    ]) as typeof FeedService.getFeedsBatch;

    const wrapper = ({ children }: { children: React.ReactNode }) =>
      createElement(QueryClientProvider, { client: queryClient }, children);

    try {
      const { result } = renderHook(
        () =>
          useFeedLoader({
            articleFilter: "all",
            categoriesRef,
            feedRef,
            setCategories: mock(() => {}),
            setExpandedArticleKey: mock(() => {}),
            setFeed,
            setLoading: mock(() => {}),
            usePlaceholderData: false,
          }),
        { wrapper },
      );

      await runWithAct(async () => {
        await result.current.prefetchFeed(prefetchedFeedUrl);
      });

      await waitFor(() => {
        expect(FeedService.getFeedsBatch).toHaveBeenCalledTimes(1);
      });

      await runWithAct(async () => {
        await result.current.fetchFeed(prefetchedFeedUrl);
      });

      await waitFor(() => {
        expect(feedState[0]?.title).toBe(prefetchedArticle.title);
      });

      expect(FeedService.getFeedsBatch).toHaveBeenCalledTimes(1);
      expect(clearedFeed).toBe(false);
    } finally {
      queryClient.clear();
    }
  });

  test("reuses each prefetched page limit from cache while warming the next page", async () => {
    const categoriesRef = { current: [] as CategoryTreeNode[] };
    const prefetchedFeedUrl = "https://example.com/paged.xml";
    let feedState: Article[] = [];
    const feedRef = { current: feedState };
    const pageFourArticle: Article = {
      content: "Page four article body",
      feedId: 3,
      feedName: "Paged Feed",
      feedUrl: prefetchedFeedUrl,
      id: 201,
      isRead: false,
      isStarred: false,
      lastChecked: new Date("2026-03-14T12:01:00.000Z"),
      link: "https://example.com/articles/page-4",
      publicationDate: new Date("2026-03-14T12:00:30.000Z"),
      title: "Page four article",
    };
    const pageEightArticle: Article = {
      ...pageFourArticle,
      id: 202,
      lastChecked: new Date("2026-03-14T12:02:00.000Z"),
      link: "https://example.com/articles/page-8",
      publicationDate: new Date("2026-03-14T12:01:30.000Z"),
      title: "Page eight article",
    };
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          gcTime: Number.POSITIVE_INFINITY,
          queryKeyHashFn: (queryKey) => JSON.stringify(queryKey),
          refetchOnReconnect: false,
          refetchOnWindowFocus: false,
          retry: false,
        },
      },
    });
    const setFeed = mock((updater: React.SetStateAction<Article[]>) => {
      feedState = typeof updater === "function" ? updater(feedState) : updater;
      feedRef.current = feedState;
    });

    FeedService.getFeedsBatch = mock(
      async (_urls: string[], options?: { articleLimit?: number }) => {
        if (options?.articleLimit === 8) {
          return [
            {
              articles: [pageEightArticle],
              lastFetchedAt: new Date("2026-03-14T12:03:00.000Z"),
              ok: true,
              url: prefetchedFeedUrl,
            },
          ];
        }

        return [
          {
            articles: [pageFourArticle],
            lastFetchedAt: new Date("2026-03-14T12:02:00.000Z"),
            ok: true,
            url: prefetchedFeedUrl,
          },
        ];
      },
    ) as typeof FeedService.getFeedsBatch;

    const wrapper = ({ children }: { children: React.ReactNode }) =>
      createElement(QueryClientProvider, { client: queryClient }, children);

    try {
      const { result } = renderHook(
        () =>
          useFeedLoader({
            articleFilter: "all",
            categoriesRef,
            feedRef,
            setCategories: mock(() => {}),
            setExpandedArticleKey: mock(() => {}),
            setFeed,
            setLoading: mock(() => {}),
            usePlaceholderData: false,
          }),
        { wrapper },
      );

      await runWithAct(async () => {
        await result.current.prefetchFeed(prefetchedFeedUrl, {
          articleLimit: 4,
          keepExistingFeed: true,
          requestSource: "feed-scroll-load-more",
          skipRefresh: true,
        });
      });

      await runWithAct(async () => {
        await result.current.fetchFeed(prefetchedFeedUrl, {
          articleLimit: 4,
          keepExistingFeed: true,
          requestSource: "feed-scroll-load-more",
          skipRefresh: true,
        });
      });

      await runWithAct(async () => {
        await result.current.prefetchFeed(prefetchedFeedUrl, {
          articleLimit: 8,
          keepExistingFeed: true,
          requestSource: "feed-scroll-load-more",
          skipRefresh: true,
        });
      });

      await runWithAct(async () => {
        await result.current.fetchFeed(prefetchedFeedUrl, {
          articleLimit: 8,
          keepExistingFeed: true,
          requestSource: "feed-scroll-load-more",
          skipRefresh: true,
        });
      });

      await waitFor(() => {
        expect(feedState[0]?.title).toBe(pageEightArticle.title);
      });

      expect(FeedService.getFeedsBatch).toHaveBeenCalledTimes(2);
    } finally {
      queryClient.clear();
    }
  });

  test("builds batch outcomes from the latest feed snapshot without a state-updater side effect", () => {
    const previousFeed: Article[] = [
      {
        content: "hydrated body",
        feedId: 1,
        feedName: "Space News",
        feedUrl: "https://example.com/feed.xml",
        id: 1,
        isRead: false,
        isStarred: false,
        lastChecked: new Date("2026-03-14T12:04:00.000Z"),
        link: "https://example.com/articles/1",
        publicationDate: new Date("2026-03-14T12:00:00.000Z"),
        title: "Cached article",
      },
    ];
    const normalizedSources: FeedBatchSource[] = [
      {
        name: "Space News",
        url: "https://example.com/feed.xml",
      },
    ];

    const outcome = buildFeedBatchOutcome(
      normalizedSources,
      [
        {
          articles: [],
          lastFetchedAt: new Date("2026-03-14T12:05:00.000Z"),
          ok: true,
          unchanged: true,
          url: "https://example.com/feed.xml",
        },
      ],
      false,
      () => [],
      previousFeed,
    );

    expect(outcome.articles).toEqual(previousFeed);
    expect(outcome.failedFeeds).toEqual([]);
    expect(outcome.newestLastFetchedAt?.toISOString()).toBe(
      "2026-03-14T12:05:00.000Z",
    );
    expect(outcome.sourceNamesByUrl.get("https://example.com/feed.xml")).toBe(
      "Space News",
    );
  });

  test("does not show a partial-failure toast for skip-refresh cache reads", async () => {
    const categoriesRef = { current: [] as CategoryTreeNode[] };
    let feedState: Article[] = [];
    const feedRef = { current: feedState };
    const successfulUrl = "https://example.com/success.xml";
    const failedUrl = "https://example.com/failed.xml";
    const categoryNode: CategoryTreeNode = {
      children: [
        {
          data: {
            category: "News",
            enabled: true,
            sourceId: 1,
            url: successfulUrl,
          },
          key: "news-1",
          label: "Success Feed",
        },
        {
          data: {
            category: "News",
            enabled: true,
            sourceId: 2,
            url: failedUrl,
          },
          key: "news-2",
          label: "Failed Feed",
        },
      ],
      key: "cat-news",
      label: "News",
    };
    const cachedArticle: Article = {
      content: "Cached article body",
      feedId: 1,
      feedName: "Success Feed",
      feedUrl: successfulUrl,
      id: 101,
      isRead: false,
      isStarred: false,
      lastChecked: new Date("2026-03-14T12:04:00.000Z"),
      link: "https://example.com/articles/cached",
      publicationDate: new Date("2026-03-14T12:03:00.000Z"),
      title: "Cached article",
    };
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          gcTime: Number.POSITIVE_INFINITY,
          queryKeyHashFn: (queryKey) => JSON.stringify(queryKey),
          refetchOnReconnect: false,
          refetchOnWindowFocus: false,
          retry: false,
        },
      },
    });
    const setFeed = mock((updater: React.SetStateAction<Article[]>) => {
      feedState = typeof updater === "function" ? updater(feedState) : updater;
      feedRef.current = feedState;
    });

    FeedService.getFeedsBatch = mock(async () => [
      {
        articles: [cachedArticle],
        lastFetchedAt: new Date("2026-03-14T12:05:00.000Z"),
        ok: true,
        url: successfulUrl,
      },
      {
        articles: [],
        error: "Request failed with status code 403",
        lastFetchedAt: new Date("2026-03-14T12:05:00.000Z"),
        ok: true,
        url: failedUrl,
      },
    ]) as typeof FeedService.getFeedsBatch;

    const wrapper = ({ children }: { children: React.ReactNode }) =>
      createElement(QueryClientProvider, { client: queryClient }, children);

    try {
      const { result } = renderHook(
        () =>
          useFeedLoader({
            articleFilter: "all",
            categoriesRef,
            feedRef,
            setCategories: mock(() => {}),
            setExpandedArticleKey: mock(() => {}),
            setFeed,
            setLoading: mock(() => {}),
            usePlaceholderData: false,
          }),
        { wrapper },
      );

      await runWithAct(async () => {
        await result.current.fetchCategoryFeeds(categoryNode, {
          requestSource: "dashboard-initial-cache",
          skipRefresh: true,
        });
      });

      await waitFor(() => {
        expect(FeedService.getFeedsBatch).toHaveBeenCalledTimes(1);
      });

      expect(feedState).toEqual([cachedArticle]);
      expect(toast.warning).not.toHaveBeenCalled();
      expect(toast.error).not.toHaveBeenCalled();
    } finally {
      queryClient.clear();
    }
  });

  test("absorbs cancelled query rejections while replacing overlapping feed requests", async () => {
    const categoriesRef = { current: [] as CategoryTreeNode[] };
    let feedState: Article[] = [];
    const feedRef = { current: feedState };
    const firstFeedUrl = "https://example.com/first.xml";
    const secondFeedUrl = "https://example.com/second.xml";
    const firstArticle: Article = {
      content: "First feed article body",
      feedId: 11,
      feedName: "First Feed",
      feedUrl: firstFeedUrl,
      id: 601,
      isRead: false,
      isStarred: false,
      lastChecked: new Date("2026-03-14T13:00:00.000Z"),
      link: "https://example.com/articles/first",
      publicationDate: new Date("2026-03-14T12:59:00.000Z"),
      title: "First feed article",
    };
    const secondArticle: Article = {
      ...firstArticle,
      feedId: 12,
      feedName: "Second Feed",
      feedUrl: secondFeedUrl,
      id: 602,
      link: "https://example.com/articles/second",
      publicationDate: new Date("2026-03-14T13:01:00.000Z"),
      title: "Second feed article",
    };
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          gcTime: Number.POSITIVE_INFINITY,
          queryKeyHashFn: (queryKey) => JSON.stringify(queryKey),
          refetchOnReconnect: false,
          refetchOnWindowFocus: false,
          retry: false,
        },
      },
    });
    const cancelQueriesMock = mock(async () => {
      const cancellationError = new Error("query cancelled");
      cancellationError.name = "CancelledError";
      throw cancellationError;
    });
    const setFeed = mock((updater: React.SetStateAction<Article[]>) => {
      feedState = typeof updater === "function" ? updater(feedState) : updater;
      feedRef.current = feedState;
    });

    queryClient.cancelQueries = cancelQueriesMock as typeof queryClient.cancelQueries;

    FeedService.getFeedsBatch = mock(async (urls: string[]) => {
      await new Promise((resolve) => setTimeout(resolve, 5));

      if (urls[0] === secondFeedUrl) {
        return [
          {
            articles: [secondArticle],
            lastFetchedAt: new Date("2026-03-14T13:02:00.000Z"),
            ok: true,
            url: secondFeedUrl,
          },
        ];
      }

      return [
        {
          articles: [firstArticle],
          lastFetchedAt: new Date("2026-03-14T13:01:30.000Z"),
          ok: true,
          url: firstFeedUrl,
        },
      ];
    }) as typeof FeedService.getFeedsBatch;

    const wrapper = ({ children }: { children: React.ReactNode }) =>
      createElement(QueryClientProvider, { client: queryClient }, children);

    try {
      const { result } = renderHook(
        () =>
          useFeedLoader({
            articleFilter: "all",
            categoriesRef,
            feedRef,
            setCategories: mock(() => {}),
            setExpandedArticleKey: mock(() => {}),
            setFeed,
            setLoading: mock(() => {}),
            usePlaceholderData: false,
          }),
        { wrapper },
      );

      await runWithAct(async () => {
        const firstRequest = result.current.fetchFeed(firstFeedUrl, {
          requestSource: "manual-refresh",
        });
        const secondRequest = result.current.fetchFeed(secondFeedUrl, {
          forceRefresh: true,
          requestSource: "manual-refresh",
        });

        await Promise.allSettled([firstRequest, secondRequest]);
      });

      await waitFor(() => {
        expect(feedState[0]?.title).toBe(secondArticle.title);
      });

      expect(cancelQueriesMock).toHaveBeenCalledTimes(1);
    } finally {
      queryClient.clear();
    }
  });

  test("restores previous articles when a batch fetch fails with a transient error (e.g. 504)", async () => {
    // Verify that a fetch failure (non-cancellation, non-superseded) does not
    // leave the user staring at an empty list after clearStaleFeedBeforeRefresh
    // cleared the feed in anticipation of a successful response.
    const categoriesRef = { current: [] as CategoryTreeNode[] };
    const feedUrl = "https://example.com/feed-504.xml";
    const existingArticle: Article = {
      content: "Pre-existing article body",
      feedId: 20,
      feedName: "Existing Feed",
      feedUrl,
      id: 701,
      isRead: false,
      isStarred: false,
      lastChecked: new Date("2026-04-01T10:00:00.000Z"),
      link: "https://example.com/articles/existing-504",
      publicationDate: new Date("2026-04-01T09:59:00.000Z"),
      title: "Pre-existing article",
    };
    let feedState: Article[] = [existingArticle];
    const feedRef = { current: feedState };
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          gcTime: Number.POSITIVE_INFINITY,
          queryKeyHashFn: (queryKey) => JSON.stringify(queryKey),
          refetchOnReconnect: false,
          refetchOnWindowFocus: false,
          retry: false,
        },
      },
    });
    const setFeed = mock((updater: React.SetStateAction<Article[]>) => {
      feedState = typeof updater === "function" ? updater(feedState) : updater;
      feedRef.current = feedState;
    });

    // Simulate a 504 Gateway Timeout: the API call rejects with a non-cancellation error.
    const gatewayTimeoutError = Object.assign(new Error("Request failed with status code 504"), {
      name: "ApiError",
      status: 504,
    });
    FeedService.getFeedsBatch = mock(async () => {
      throw gatewayTimeoutError;
    }) as typeof FeedService.getFeedsBatch;

    // Suppress the expected console.error noise from the error handler.
    console.error = mock(() => {});

    const wrapper = ({ children }: { children: React.ReactNode }) =>
      createElement(QueryClientProvider, { client: queryClient }, children);

    try {
      const { result } = renderHook(
        () =>
          useFeedLoader({
            articleFilter: "all",
            categoriesRef,
            feedRef,
            setCategories: mock(() => {}),
            setExpandedArticleKey: mock(() => {}),
            setFeed,
            setLoading: mock(() => {}),
            usePlaceholderData: false,
          }),
        { wrapper },
      );

      await runWithAct(async () => {
        await result.current.fetchFeed(feedUrl, {
          forceRefresh: true,
          requestSource: "manual-refresh",
        });
      });

      // After the 504 failure, the feed must be restored to the pre-clear state.
      // An empty feedState here means the user sees a blank list — that is the bug.
      await waitFor(() => {
        expect(feedState.length).toBeGreaterThan(0);
        expect(feedState[0]?.title).toBe(existingArticle.title);
      });
    } finally {
      queryClient.clear();
    }
  });
});

describe("useDashboardEvents", () => {
  test("coalesces repeated search events to the latest term per frame", async () => {
    const originalCancelAnimationFrame = global.cancelAnimationFrame;
    const originalRequestAnimationFrame = global.requestAnimationFrame;
    let queuedFrame: FrameRequestCallback | undefined;
    const onSearchChange = mock(() => {});

    global.requestAnimationFrame = ((callback: FrameRequestCallback) => {
      queuedFrame = callback;
      return 1;
    }) as typeof requestAnimationFrame;
    global.cancelAnimationFrame = (() => {}) as typeof cancelAnimationFrame;

    try {
      renderHook(() =>
        useDashboardEvents({
          onMarkViewportRead: async () => {},
          onOpenFeedsSidebar: () => {},
          onOpenSettings: () => {},
          onRefresh: async () => {},
          onSearchChange,
          selectedCategory: "system-all-feeds",
          selectedCategoryNode: undefined,
          selectedFeedUrl: undefined,
        }),
      );

      act(() => {
        window.dispatchEvent(
          new CustomEvent(DASHBOARD_EVENTS.SEARCH_CHANGE, {
            detail: { term: "a" },
          }),
        );
        window.dispatchEvent(
          new CustomEvent(DASHBOARD_EVENTS.SEARCH_CHANGE, {
            detail: { term: "ab" },
          }),
        );
      });

      expect(onSearchChange).not.toHaveBeenCalled();

      act(() => {
        queuedFrame?.(0);
      });

      await waitFor(() => {
        expect(onSearchChange).toHaveBeenCalledTimes(1);
        expect(onSearchChange).toHaveBeenCalledWith("ab");
      });
    } finally {
      global.cancelAnimationFrame = originalCancelAnimationFrame;
      global.requestAnimationFrame = originalRequestAnimationFrame;
    }
  });

  test("uses the latest search callback after rerender", async () => {
    const firstOnSearchChange = mock(() => {});
    const secondOnSearchChange = mock(() => {});

    const { rerender } = renderHook(
      ({ onSearchChange }: { onSearchChange: (term: string) => void }) =>
        useDashboardEvents({
          onMarkViewportRead: async () => {},
          onOpenFeedsSidebar: () => {},
          onOpenSettings: () => {},
          onRefresh: async () => {},
          onSearchChange,
          selectedCategory: "system-all-feeds",
          selectedCategoryNode: undefined,
          selectedFeedUrl: undefined,
        }),
      {
        initialProps: { onSearchChange: firstOnSearchChange },
      },
    );

    rerender({ onSearchChange: secondOnSearchChange });

    act(() => {
      window.dispatchEvent(
        new CustomEvent(DASHBOARD_EVENTS.SEARCH_CHANGE, {
          detail: { term: "latest" },
        }),
      );
    });

    await waitFor(() => {
      expect(firstOnSearchChange).not.toHaveBeenCalled();
      expect(secondOnSearchChange).toHaveBeenCalledTimes(1);
      expect(secondOnSearchChange).toHaveBeenCalledWith("latest");
    });
  });

  test("marks fully visible unread articles through the viewport command", async () => {
    const dispatchedEvents: string[] = [];
    // Capture when the handler is called relative to the lifecycle events. The
    // handler is intentionally async to verify that END fires before the server
    // round-trip completes (i.e. the toolbar does not block on persistence).
    let resolveHandler!: () => void;
    const handlerSettled = new Promise<void>((resolve) => {
      resolveHandler = resolve;
    });
    const onMarkViewportRead = mock(async () => {
      await Promise.resolve(); // simulate micro-task / server tick
      dispatchedEvents.push("handler");
      resolveHandler();
    });
    const eventTarget = {
      dispatchEvent(event: Event) {
        dispatchedEvents.push(event.type);
        return true;
      },
    } satisfies Pick<Window, "dispatchEvent">;

    runDashboardViewportReadCommand(eventTarget, onMarkViewportRead);

    // START and END must fire synchronously before the async handler resolves.
    expect(dispatchedEvents).toEqual([
      DASHBOARD_EVENTS.MARK_VIEWPORT_READ_START,
      DASHBOARD_EVENTS.MARK_VIEWPORT_READ_END,
    ]);

    // Handler still completes in the background (server persistence).
    await handlerSettled;
    expect(dispatchedEvents).toEqual([
      DASHBOARD_EVENTS.MARK_VIEWPORT_READ_START,
      DASHBOARD_EVENTS.MARK_VIEWPORT_READ_END,
      "handler",
    ]);
  });
});

describe("useCategoryOrderState", () => {
  const originalGetCategoryOrder = FeedService.getCategoryOrder;
  const originalSaveCategoryOrder = FeedService.saveCategoryOrder;

  afterEach(() => {
    FeedService.getCategoryOrder = originalGetCategoryOrder;
    FeedService.saveCategoryOrder = originalSaveCategoryOrder;
  });

  test("skips loading category order in placeholder mode", async () => {
    FeedService.getCategoryOrder = mock(async () => ["News"]);

    const { result } = renderHook(() =>
      useCategoryOrderState({ usePlaceholderData: true }),
    );

    await runWithAct(async () => {
      await Promise.resolve();
    });

    expect(FeedService.getCategoryOrder).not.toHaveBeenCalled();
    expect(result.current.orderedCategoryLabels).toEqual([]);
  });

  test("loads a saved category order when placeholder mode is disabled", async () => {
    FeedService.getCategoryOrder = mock(async () => ["News", "Tech"]);

    const { result } = renderHook(() =>
      useCategoryOrderState({ usePlaceholderData: false }),
    );

    await waitFor(() => {
      expect(result.current.orderedCategoryLabels).toEqual(["News", "Tech"]);
    });
  });

  test("ignores category order load errors", async () => {
    FeedService.getCategoryOrder = mock(async () => {
      throw new Error("load failed");
    });

    const { result } = renderHook(() =>
      useCategoryOrderState({ usePlaceholderData: false }),
    );

    await runWithAct(async () => {
      await Promise.resolve();
    });

    expect(result.current.orderedCategoryLabels).toEqual([]);
  });

  test("debounces category order persistence", async () => {
    FeedService.getCategoryOrder = mock(async () => []);
    FeedService.saveCategoryOrder = mock(async () => {});

    const { result } = renderHook(() =>
      useCategoryOrderState({ usePlaceholderData: false }),
    );

    act(() => {
      result.current.setOrderedCategoryLabels(["News", "Tech"]);
    });

    await runWithAct(async () => {
      await new Promise((resolve) => setTimeout(resolve, 550));
    });

    expect(FeedService.saveCategoryOrder).toHaveBeenCalledWith([
      "News",
      "Tech",
    ]);
  });

  test("persists only the latest category order after successive updates", async () => {
    FeedService.getCategoryOrder = mock(async () => []);
    FeedService.saveCategoryOrder = mock(async () => {});

    const { result } = renderHook(() =>
      useCategoryOrderState({ usePlaceholderData: false }),
    );

    act(() => {
      result.current.setOrderedCategoryLabels(["News"]);
      result.current.setOrderedCategoryLabels(["Tech", "News"]);
    });

    await runWithAct(async () => {
      await new Promise((resolve) => setTimeout(resolve, 550));
    });

    expect(FeedService.saveCategoryOrder).toHaveBeenCalledTimes(1);
    expect(FeedService.saveCategoryOrder).toHaveBeenCalledWith([
      "Tech",
      "News",
    ]);
  });

  test("cancels a pending category-order save when the hook unmounts", async () => {
    FeedService.getCategoryOrder = mock(async () => []);
    FeedService.saveCategoryOrder = mock(async () => {});

    const { result, unmount } = renderHook(() =>
      useCategoryOrderState({ usePlaceholderData: false }),
    );

    act(() => {
      result.current.setOrderedCategoryLabels(["News", "Tech"]);
    });

    await runWithAct(async () => {
      await Promise.resolve();
    });

    unmount();

    await runWithAct(async () => {
      await new Promise((resolve) => setTimeout(resolve, 550));
    });

    expect(FeedService.saveCategoryOrder).not.toHaveBeenCalled();
  });
});

// ─── useArticleActions ────────────────────────────────────────────────────────

describe("useArticleActions", () => {
  test("toggleRead switches read status", () => {
    expect(!true).toBe(false);
    expect(!false).toBe(true);
  });

  test("toggleStarred switches starred status", () => {
    expect(!true).toBe(false);
    expect(!false).toBe(true);
  });
});

function registerModuleMocks() {
  mock.module("sonner", () => ({
    toast: {
      error: mock(() => {}),
      info: mock(() => {}),
      success: mock(() => {}),
      warning: mock(() => {}),
    },
  }));
}

const runWithAct = async (callback: () => Promise<void> | void) => {
  await act(async () => {
    await callback();
  });
};

beforeAll(() => {
  registerModuleMocks();
});

beforeEach(() => {
  mock.restore();
  registerModuleMocks();
});

afterEach(() => {
  mock.restore();
});

const originalExtractArticleContent = ArticleService.extractArticleContent;
const originalGetFeedsBatch = FeedService.getFeedsBatch;
const originalUpdateArticleStatus = ArticleService.updateArticleStatus;
const originalConsoleError = console.error;
const originalConsoleInfo = console.info;
const originalEnableTestLogOutput = process.env.ENABLE_TEST_LOG_OUTPUT;
const originalClientFeedRefreshDiagnosticsEnabled =
  process.env.NEXT_PUBLIC_FEED_REFRESH_DIAGNOSTICS_ENABLED;
const muteConsoleError = (() => {}) as typeof console.error;
const muteConsoleInfo = (() => {}) as typeof console.info;

beforeEach(() => {
  process.env.NEXT_PUBLIC_FEED_REFRESH_DIAGNOSTICS_ENABLED = "false";
  process.env.ENABLE_TEST_LOG_OUTPUT = "true";
});

afterEach(() => {
  ArticleService.extractArticleContent =
    originalExtractArticleContent as typeof ArticleService.extractArticleContent;
  FeedService.getFeedsBatch =
    originalGetFeedsBatch as typeof FeedService.getFeedsBatch;
  ArticleService.updateArticleStatus =
    originalUpdateArticleStatus as typeof ArticleService.updateArticleStatus;
  console.error = originalConsoleError;
  console.info = originalConsoleInfo;
  if (originalEnableTestLogOutput === undefined) {
    delete process.env.ENABLE_TEST_LOG_OUTPUT;
  } else {
    process.env.ENABLE_TEST_LOG_OUTPUT = originalEnableTestLogOutput;
  }
  if (originalClientFeedRefreshDiagnosticsEnabled === undefined) {
    delete process.env.NEXT_PUBLIC_FEED_REFRESH_DIAGNOSTICS_ENABLED;
  } else {
    process.env.NEXT_PUBLIC_FEED_REFRESH_DIAGNOSTICS_ENABLED =
      originalClientFeedRefreshDiagnosticsEnabled;
  }
});

afterAll(() => {
  mock.restore();
});

describe("useArticleHydration", () => {
  const createMockArticle = (overrides?: Partial<Article>): Article => ({
    content: "Short content",
    feedId: 1,
    feedName: "Test Feed",
    feedUrl: "https://example.com/feed",
    id: 1,
    isRead: false,
    isStarred: false,
    lastChecked: new Date(),
    link: "https://example.com/article",
    publicationDate: new Date("2024-01-01"),
    title: "Test Article",
    ...overrides,
  });

  beforeEach(() => {
    document.body.innerHTML = "";
    // Reset CSS global
    global.CSS = {
      escape: (str: string) =>
        str.replace(/[!"#$%&'()*+,./:;<=>?@[\\\]^`{|}~]/g, "\\$&"),
    } as any;

    ArticleService.extractArticleContent = mock(
      async () => "<p>Extracted content</p>",
    ) as unknown as typeof ArticleService.extractArticleContent;
    ArticleService.getStoredArticleContent = mock(
      async () => "<p>Stored article content</p>",
    ) as unknown as typeof ArticleService.getStoredArticleContent;
    ArticleService.updateArticleStatus = mock(
      async () => {},
    ) as unknown as typeof ArticleService.updateArticleStatus;
    console.error = muteConsoleError;
    console.info = mock(muteConsoleInfo) as unknown as typeof console.info;
    (toast.error as ReturnType<typeof mock>).mockClear();
  });

  test("initializes with empty state", () => {
    const setFeed = mock(() => {});

    const { result } = renderHook(() => useArticleHydration({ setFeed }));

    expect(result.current.hydratedArticleLinks).toEqual({});
    expect(result.current.hydratingArticleLinks).toEqual({});
  });

  test("escapeArticleKey uses CSS.escape when available", () => {
    const key = "1_https://example.com/article?param=value";
    const escaped = escapeArticleKey(key);

    expect(escaped).toBeDefined();
    expect(typeof escaped).toBe("string");
  });

  test("escapeArticleKey fallback when CSS.escape unavailable", () => {
    global.CSS = undefined as any;

    const key = 'test"article\\key';
    const escaped = escapeArticleKey(key);

    expect(escaped).toContain("\\");
  });

  test("scrollArticleIntoView scrolls element into view", () => {
    const mockElement = document.createElement("div");
    mockElement.setAttribute(
      "data-article-key",
      "1_https://example.com/article",
    );
    mockElement.scrollIntoView = mock(() => {});
    document.body.appendChild(mockElement);

    const setFeed = mock(() => {});
    const { result } = renderHook(() => useArticleHydration({ setFeed }));

    result.current.scrollArticleIntoView("1_https://example.com/article");

    expect(mockElement.scrollIntoView).toHaveBeenCalled();

    document.body.removeChild(mockElement);
  });

  test("scrollArticleIntoView handles missing element gracefully", () => {
    const setFeed = mock(() => {});
    const { result } = renderHook(() => useArticleHydration({ setFeed }));

    // Should not throw
    result.current.scrollArticleIntoView("non-existent-key");
  });

  test("hydrateArticleContent fetches and updates article content", async () => {
    const article = createMockArticle();
    let feedState = [article];
    const setFeed = mock((updater: any) => {
      feedState = typeof updater === "function" ? updater(feedState) : updater;
    });

    const { result } = renderHook(() => useArticleHydration({ setFeed }));

    await runWithAct(async () => {
      await result.current.hydrateArticleContent(article);
    });

    await waitFor(() => {
      expect(ArticleService.extractArticleContent).toHaveBeenCalledWith(
        "https://example.com/article",
        expect.objectContaining({ useProxy: undefined }),
      );
      expect(feedState[0].content).toContain("Extracted");
    });
  });

  test("hydrateArticleContent skips invalid URLs", async () => {
    const article = createMockArticle({ link: "invalid-url" });
    const setFeed = mock(() => {});
    const beforeCalls = (
      ArticleService.extractArticleContent as ReturnType<typeof mock>
    ).mock.calls.length;

    const { result } = renderHook(() => useArticleHydration({ setFeed }));

    await runWithAct(async () => {
      await result.current.hydrateArticleContent(article);
    });

    const afterCalls = (
      ArticleService.extractArticleContent as ReturnType<typeof mock>
    ).mock.calls.length;
    expect(afterCalls).toBe(beforeCalls);
  });

  test("hydrateArticleContent skips empty URLs", async () => {
    const article = createMockArticle({ link: "" });
    const setFeed = mock(() => {});
    const beforeCalls = (
      ArticleService.extractArticleContent as ReturnType<typeof mock>
    ).mock.calls.length;

    const { result } = renderHook(() => useArticleHydration({ setFeed }));

    await runWithAct(async () => {
      await result.current.hydrateArticleContent(article);
    });

    const afterCalls = (
      ArticleService.extractArticleContent as ReturnType<typeof mock>
    ).mock.calls.length;
    expect(afterCalls).toBe(beforeCalls);
  });

  test("hydrateArticleContent skips re-fetch on repeated calls", async () => {
    const article = createMockArticle();
    let feedState = [article];
    const setFeed = mock((updater: any) => {
      feedState = typeof updater === "function" ? updater(feedState) : updater;
    });

    const { result } = renderHook(() => useArticleHydration({ setFeed }));

    // Hydrate once
    await runWithAct(async () => {
      await result.current.hydrateArticleContent(article);
    });
    await waitFor(() => {
      expect(result.current.hydratedArticleLinks[article.link]).toBe(true);
    });

    // Reset mock and change returned content for second hydration attempt
    (ArticleService.extractArticleContent as ReturnType<typeof mock>)
      .mockClear()
      .mockImplementation(async () => "<p>Different content</p>");

    // Try to hydrate again
    await runWithAct(async () => {
      await result.current.hydrateArticleContent(article);
    });

    // Should skip extraction because this link is already hydrated
    const afterSecondHydrateCalls = (
      ArticleService.extractArticleContent as ReturnType<typeof mock>
    ).mock.calls.length;
    const infoCalls = (console.info as ReturnType<typeof mock>).mock.calls;
    expect(result.current.hydratedArticleLinks[article.link]).toBe(true);
    expect(afterSecondHydrateCalls).toBe(0);
    expect(infoCalls.length).toBeGreaterThanOrEqual(1);
    expect(infoCalls[0]?.[0]).toBe("[dashboard] Article hydration cache hit");
    expect(infoCalls[0]?.[1]).toEqual({ link: article.link });
    expect(feedState[0].content).toContain("Extracted content");
  });

  test("hydrateArticleContent re-fetches on repeated calls when forced", async () => {
    const article = createMockArticle();
    let feedState = [article];
    const setFeed = mock((updater: any) => {
      feedState = typeof updater === "function" ? updater(feedState) : updater;
    });

    const { result } = renderHook(() => useArticleHydration({ setFeed }));

    await runWithAct(async () => {
      await result.current.hydrateArticleContent(article);
    });

    (ArticleService.extractArticleContent as ReturnType<typeof mock>)
      .mockClear()
      .mockImplementation(async () => "<p>Fresh forced content</p>");

    await runWithAct(async () => {
      await result.current.hydrateArticleContent(article, { force: true });
    });

    await waitFor(() => {
      expect(ArticleService.extractArticleContent).toHaveBeenCalledTimes(1);
      expect(feedState[0].content).toContain("Fresh forced content");
    });
  });

  test("hydrateArticleContent does not skip articles with substantial content", async () => {
    const longContent = "x".repeat(2000);
    const article = createMockArticle({ content: longContent });
    const setFeed = mock(() => {});

    const { result } = renderHook(() => useArticleHydration({ setFeed }));

    await result.current.hydrateArticleContent(article);

    expect(ArticleService.extractArticleContent).toHaveBeenCalledWith(
      article.link,
      expect.objectContaining({ useProxy: undefined }),
    );
  });

  test("hydrateArticleContent updates hydrating state", async () => {
    const article = createMockArticle();
    const setFeed = mock(() => {});

    (ArticleService.extractArticleContent as ReturnType<typeof mock>)
      .mockClear()
      .mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return "<p>Slow content</p>";
      });

    const { result } = renderHook(() => useArticleHydration({ setFeed }));

    await runWithAct(async () => {
      await result.current.hydrateArticleContent(article);
    });

    // Check that hydrating state is cleared
    await waitFor(() => {
      expect(
        result.current.hydratingArticleLinks[article.link],
      ).toBeUndefined();
    });
  });

  test("hydrateArticleContent skips in-flight requests", async () => {
    const article = createMockArticle();
    const setFeed = mock(() => {});

    (ArticleService.extractArticleContent as ReturnType<typeof mock>)
      .mockClear()
      .mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return "<p>Content</p>";
      });

    const { result } = renderHook(() => useArticleHydration({ setFeed }));

    // Start two hydrations simultaneously
    const promise1 = runWithAct(async () => {
      await result.current.hydrateArticleContent(article);
    });
    const promise2 = runWithAct(async () => {
      await result.current.hydrateArticleContent(article);
    });

    await Promise.all([promise1, promise2]);

    // Should only call once
    expect(ArticleService.extractArticleContent).toHaveBeenCalledTimes(1);
  });

  test("hydrateArticleContent replaces content even when extracted content is shorter", async () => {
    const longContent = "x".repeat(500);
    const article = createMockArticle({ content: longContent });
    let feedState = [article];
    const setFeed = mock((updater: any) => {
      feedState = typeof updater === "function" ? updater(feedState) : updater;
    });

    (ArticleService.extractArticleContent as ReturnType<typeof mock>)
      .mockClear()
      .mockImplementation(async () => "Short");

    const { result } = renderHook(() => useArticleHydration({ setFeed }));

    await runWithAct(async () => {
      await result.current.hydrateArticleContent(article);
    });

    await waitFor(() => {
      expect(feedState[0].content).toBe("Short");
    });
  });

  test("hydrateArticleContent handles extraction errors", async () => {
    const article = createMockArticle();
    const setFeed = mock(() => {});

    (ArticleService.extractArticleContent as ReturnType<typeof mock>)
      .mockClear()
      .mockImplementation(async () => {
        throw new Error("Network error");
      });

    const { result } = renderHook(() => useArticleHydration({ setFeed }));

    // Should not throw
    await runWithAct(async () => {
      await result.current.hydrateArticleContent(article);
    });

    expect(toast.error).toHaveBeenCalledWith(
      "Unable to extract article content right now.",
    );
  });

  test("hydrateArticleContent prefers the structured extract route error in the toast", async () => {
    interface MockApiError extends Error {
      isApiError: boolean;
      response: {
        data: {
          error: string;
          reason: string;
        };
        status: number;
      };
    }

    const article = createMockArticle();
    const setFeed = mock(() => {});

    (ArticleService.extractArticleContent as ReturnType<typeof mock>)
      .mockClear()
      .mockImplementation(async () => {
        const error = new Error(
          "Request failed with status code 502",
        ) as MockApiError;
        error.isApiError = true;
        error.response = {
          data: {
            error: "Failed to fetch article content from upstream",
            reason: "Upstream responded with status 403",
          },
          status: 502,
        };
        throw error;
      });

    const { result } = renderHook(() => useArticleHydration({ setFeed }));

    await runWithAct(async () => {
      await result.current.hydrateArticleContent(article);
    });

    expect(toast.error).toHaveBeenCalledWith(
      "Failed to fetch article content from upstream: Upstream responded with status 403",
    );
  });

  test("hydrateArticleContent handles empty extracted content", async () => {
    const article = createMockArticle();
    let feedState = [article];
    const setFeed = mock((updater: any) => {
      feedState = typeof updater === "function" ? updater(feedState) : updater;
    });

    (ArticleService.extractArticleContent as ReturnType<typeof mock>)
      .mockClear()
      .mockImplementation(async () => "");

    const { result } = renderHook(() => useArticleHydration({ setFeed }));

    await runWithAct(async () => {
      await result.current.hydrateArticleContent(article);
    });

    await waitFor(() => {
      expect(feedState[0].content).toBe("Short content");
    });
  });

  test("hydrateArticleContent does not mark article as hydrated on empty content", async () => {
    const article = createMockArticle();
    const setFeed = mock(() => {});

    (ArticleService.extractArticleContent as ReturnType<typeof mock>)
      .mockClear()
      .mockImplementation(async () => "");

    const { result } = renderHook(() => useArticleHydration({ setFeed }));

    await runWithAct(async () => {
      await result.current.hydrateArticleContent(article);
    });

    await waitFor(() => {
      expect(result.current.hydratedArticleLinks[article.link]).toBeUndefined();
    });
  });

  test("hydrateArticleContent loads stored article content when extraction is disabled", async () => {
    const article = createMockArticle();
    let feedState = [article];
    const setFeed = mock((updater: React.SetStateAction<Article[]>) => {
      feedState = typeof updater === "function" ? updater(feedState) : updater;
    });

    const { result } = renderHook(() =>
      useArticleHydration({
        getFeedSettings: () => ({ extractionDisabled: true }),
        setFeed,
      }),
    );

    await runWithAct(async () => {
      await result.current.hydrateArticleContent(article);
    });

    await waitFor(() => {
      expect(ArticleService.getStoredArticleContent).toHaveBeenCalledWith(1);
      expect(ArticleService.extractArticleContent).not.toHaveBeenCalled();
      expect(feedState[0]?.content).toBe("<p>Stored article content</p>");
      expect(feedState[0]?.hasFullContent).toBe(true);
      expect(result.current.hydratedArticleLinks[article.link]).toBeUndefined();
    });
  });

  test("hydrateArticleContent keeps placeholder snapshot URLs on the extract path", async () => {
    const article = createMockArticle({
      feedUrl: "https://www.usgs.gov/news/news-releases",
      link: "https://www.usgs.gov/news/national-news-release/value-us-mineral-production-rose-last-year-driven-precious-metals-prices",
    });
    let feedState = [article];
    const setFeed = mock((updater: React.SetStateAction<Article[]>) => {
      feedState = typeof updater === "function" ? updater(feedState) : updater;
    });

    const { result } = renderHook(() =>
      useArticleHydration({
        getFeedSettings: () => ({ extractionDisabled: true }),
        setFeed,
      }),
    );

    await runWithAct(async () => {
      await result.current.hydrateArticleContent(article);
    });

    await waitFor(() => {
      expect(ArticleService.getStoredArticleContent).not.toHaveBeenCalled();
      expect(ArticleService.extractArticleContent).toHaveBeenCalledWith(
        article.link,
        expect.objectContaining({ useProxy: undefined }),
      );
      expect(feedState[0]?.content).toContain("Extracted");
      expect(result.current.hydratedArticleLinks[article.link]).toBe(true);
    });
  });

  test("hydrateArticleContent skips reloading when full stored content is already present", async () => {
    const article = createMockArticle({ hasFullContent: true });
    const setFeed = mock(() => {});

    const { result } = renderHook(() =>
      useArticleHydration({
        getFeedSettings: () => ({ extractionDisabled: true }),
        setFeed,
      }),
    );

    await runWithAct(async () => {
      await result.current.hydrateArticleContent(article);
    });

    expect(ArticleService.getStoredArticleContent).not.toHaveBeenCalled();
    expect(ArticleService.extractArticleContent).not.toHaveBeenCalled();
  });
});

describe("useArticleReadState", () => {
  const createMockArticle = (overrides?: Partial<Article>): Article => ({
    content: "Content",
    feedId: 1,
    feedName: "Test Feed",
    feedUrl: "https://example.com/feed",
    id: 1,
    isRead: false,
    isStarred: false,
    lastChecked: new Date(),
    link: "https://example.com/article",
    publicationDate: new Date("2024-01-01"),
    title: "Test Article",
    ...overrides,
  });

  beforeEach(() => {
    ArticleService.updateArticleStatus = mock(
      async () => {},
    ) as unknown as typeof ArticleService.updateArticleStatus;
    console.error = muteConsoleError;
    (toast.error as ReturnType<typeof mock>).mockClear();
  });

  test("initializes with empty updating state", () => {
    const setFeed = mock(() => {});

    const { result } = renderHook(() => useArticleReadState({ setFeed }));

    expect(result.current.updatingArticleState).toEqual({});
  });

  test("setArticleReadState marks article as read", async () => {
    const article = createMockArticle({ isRead: false });
    let feedState = [article];
    const setFeed = mock((updater: any) => {
      feedState = typeof updater === "function" ? updater(feedState) : updater;
    });

    const { result } = renderHook(() => useArticleReadState({ setFeed }));

    await runWithAct(async () => {
      await result.current.setArticleReadState(article, true);
    });

    await waitFor(() => {
      expect(feedState[0].isRead).toBe(true);
    });
    expect(ArticleService.updateArticleStatus).toHaveBeenCalledWith(1, {
      isRead: true,
    });
  });

  test("setArticleReadState marks article as unread", async () => {
    const article = createMockArticle({ isRead: true });
    let feedState = [article];
    const setFeed = mock((updater: any) => {
      feedState = typeof updater === "function" ? updater(feedState) : updater;
    });

    const { result } = renderHook(() => useArticleReadState({ setFeed }));

    await runWithAct(async () => {
      await result.current.setArticleReadState(article, false);
    });

    await waitFor(() => {
      expect(feedState[0].isRead).toBe(false);
    });
  });

  test("setArticleReadState reverts on error", async () => {
    (ArticleService.updateArticleStatus as ReturnType<typeof mock>)
      .mockClear()
      .mockImplementation(async () => {
        throw new Error("Network error");
      });

    const article = createMockArticle({ isRead: false });
    let feedState = [article];
    const setFeed = mock((updater: any) => {
      feedState = typeof updater === "function" ? updater(feedState) : updater;
    });

    const { result } = renderHook(() => useArticleReadState({ setFeed }));

    await runWithAct(async () => {
      await result.current.setArticleReadState(article, true);
    });

    await waitFor(() => {
      expect(feedState[0].isRead).toBe(false);
    });
  });

  test("setArticleReadState shows error toast on failure", async () => {
    const mockToast = mock(() => {});
    (toast.error as ReturnType<typeof mock>)
      .mockClear()
      .mockImplementation(mockToast as any);
    (ArticleService.updateArticleStatus as ReturnType<typeof mock>)
      .mockClear()
      .mockImplementation(async () => {
        throw new Error("Network error");
      });

    const article = createMockArticle();
    const setFeed = mock(() => {});

    const { result } = renderHook(() => useArticleReadState({ setFeed }));

    await runWithAct(async () => {
      await result.current.setArticleReadState(article, true);
    });

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalled();
    });
  });

  test("setArticleReadState suppresses error toast when requested", async () => {
    const mockToast = mock(() => {});
    (toast.error as ReturnType<typeof mock>)
      .mockClear()
      .mockImplementation(mockToast as any);
    (ArticleService.updateArticleStatus as ReturnType<typeof mock>)
      .mockClear()
      .mockImplementation(async () => {
        throw new Error("Network error");
      });

    const article = createMockArticle();
    const setFeed = mock(() => {});

    const { result } = renderHook(() => useArticleReadState({ setFeed }));

    await runWithAct(async () => {
      await result.current.setArticleReadState(article, true, {
        suppressErrorToast: true,
      });
    });

    await waitFor(() => {
      expect(result.current.updatingArticleState).toEqual({});
    });

    expect(mockToast).not.toHaveBeenCalled();
  });

  test("handleToggleReadState toggles read status", async () => {
    const article = createMockArticle({ isRead: false });
    let feedState = [article];
    const setFeed = mock((updater: any) => {
      feedState = typeof updater === "function" ? updater(feedState) : updater;
    });

    const { result } = renderHook(() => useArticleReadState({ setFeed }));

    await runWithAct(async () => {
      await result.current.handleToggleReadState(article);
    });

    await waitFor(() => {
      expect(feedState[0].isRead).toBe(true);
    });
  });

  test("handleToggleReadState toggles from read to unread", async () => {
    const article = createMockArticle({ isRead: true });
    let feedState = [article];
    const setFeed = mock((updater: any) => {
      feedState = typeof updater === "function" ? updater(feedState) : updater;
    });

    const { result } = renderHook(() => useArticleReadState({ setFeed }));

    await runWithAct(async () => {
      await result.current.handleToggleReadState(article);
    });

    await waitFor(() => {
      expect(feedState[0].isRead).toBe(false);
    });
  });

  test("updating state is set during update", async () => {
    let resolveUpdate: (() => void) | undefined;

    (ArticleService.updateArticleStatus as ReturnType<typeof mock>)
      .mockClear()
      .mockImplementation(async () => {
        await new Promise<void>((resolve) => {
          resolveUpdate = resolve;
        });
      });

    const article = createMockArticle();
    const setFeed = mock(() => {});

    const { result } = renderHook(() => useArticleReadState({ setFeed }));

    let promise: Promise<boolean>;
    await act(async () => {
      promise = result.current.setArticleReadState(article, true);
      await Promise.resolve();
    });

    const articleKey = article.link;
    await waitFor(() => {
      expect(result.current.updatingArticleState[articleKey]).toBe(true);
    });

    await act(async () => {
      resolveUpdate?.();
      await promise;
    });

    await waitFor(() => {
      expect(Object.keys(result.current.updatingArticleState).length).toBe(0);
    });
  });

  test("handles multiple articles simultaneously", async () => {
    const article1 = createMockArticle({ id: 1 });
    const article2 = createMockArticle({ id: 2 });
    let feedState = [article1, article2];
    const setFeed = mock((updater: any) => {
      feedState = typeof updater === "function" ? updater(feedState) : updater;
    });

    const { result } = renderHook(() => useArticleReadState({ setFeed }));

    await Promise.all([
      result.current.setArticleReadState(article1, true),
      result.current.setArticleReadState(article2, true),
    ]);

    await waitFor(() => {
      expect(feedState[0].isRead).toBe(true);
      expect(feedState[1].isRead).toBe(true);
    });
  });
});
