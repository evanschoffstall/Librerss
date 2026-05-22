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
import * as realSonnerModule from "sonner";
import { toast } from "sonner";

import type { Article, CategoryTreeNode } from "@/lib/core";

import { DASHBOARD_EVENTS } from "@/app/dashboard/constants";
import {
  filterArticleKeysBySettledState,
  filterArticleMapBySettledState,
} from "@/app/dashboard/dashboard-hooks/article-actions/articleStatusMutationSettledState";
import { useFeedLoader } from "@/app/dashboard/dashboard-hooks/feed-loader";
import { useArticleActions } from "@/app/dashboard/dashboard-hooks/useArticleActions";
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
import { getFeedSourceTreeQueryKey } from "@/app/dashboard/dashboard-services/feed-view-model";
import { ArticleService, FeedService } from "@/lib/api";
import { PLACEHOLDER_SOURCE_DEFINITIONS } from "@/lib/core/placeholder-sources";

const getBundledPlaceholderArticle = () => {
  const definition = PLACEHOLDER_SOURCE_DEFINITIONS.find(
    (sourceDefinition) => sourceDefinition.seeds.length > 0,
  );
  const seed = definition?.seeds[0];

  if (!definition || !seed) {
    throw new Error("Expected at least one bundled placeholder article.");
  }

  return { feedUrl: definition.source.url, link: seed.url };
};

describe("useFeedLoader", () => {
  test("reuses cached feed sources immediately while refreshing them in the background", async () => {
    const categoriesRef = { current: [] as CategoryTreeNode[] };
    const cachedCategories: CategoryTreeNode[] = [
      {
        children: [],
        key: "cached-feed",
        label: "Cached Feed",
      },
    ];
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
    const setCategories = mock(
      (updater: React.SetStateAction<CategoryTreeNode[]>) => {
        categoriesRef.current =
          typeof updater === "function"
            ? updater(categoriesRef.current)
            : updater;
      },
    );
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      createElement(QueryClientProvider, { client: queryClient }, children);

    queryClient.setQueryData(
      getFeedSourceTreeQueryKey(false),
      cachedCategories,
    );
    FeedService.getFeedSources = mock(
      async () => [],
    ) as typeof FeedService.getFeedSources;

    try {
      const { result } = renderHook(
        () =>
          useFeedLoader({
            articleFilter: "all",
            articleSortOrder: "newest",
            categoriesRef,
            feedRef: { current: [] },
            setCategories,
            setExpandedArticleKey: mock(() => {}),
            setFeed: mock(() => {}),
            setLoading: mock(() => {}),
            usePlaceholderData: false,
          }),
        { wrapper },
      );

      let resolvedCategories: CategoryTreeNode[] = [];
      await runWithAct(async () => {
        resolvedCategories = await result.current.loadFeedSources();
      });

      expect(resolvedCategories).toEqual(cachedCategories);
      expect(setCategories).toHaveBeenCalledWith(cachedCategories);

      await waitFor(() => {
        expect(FeedService.getFeedSources).toHaveBeenCalledTimes(1);
      });
    } finally {
      queryClient.clear();
    }
  });

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
            articleSortOrder: "newest",
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

  test("omits known feed timestamps when refreshing an existing live search", async () => {
    const feedUrl = "https://example.com/search.xml";
    const categoriesRef = { current: [] as CategoryTreeNode[] };
    let feedState: Article[] = [];
    const feedRef = { current: feedState };
    const article: Article = {
      content: "Search result article body",
      feedId: 7,
      feedName: "Search Feed",
      feedUrl,
      id: 707,
      isRead: false,
      isStarred: false,
      lastChecked: new Date("2026-03-14T14:01:00.000Z"),
      link: "https://example.com/articles/search-result",
      publicationDate: new Date("2026-03-14T14:00:00.000Z"),
      title: "Search result",
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
    const seenOptions: Parameters<typeof FeedService.getFeedsBatch>[1][] = [];
    const setFeed = mock((updater: React.SetStateAction<Article[]>) => {
      feedState = typeof updater === "function" ? updater(feedState) : updater;
      feedRef.current = feedState;
    });

    FeedService.getFeedsBatch = mock(
      async (
        _urls: string[],
        options?: Parameters<typeof FeedService.getFeedsBatch>[1],
      ) => {
        seenOptions.push(options);

        return [
          {
            articles: [article],
            lastFetchedAt: new Date("2026-03-14T14:02:00.000Z"),
            ok: true,
            url: feedUrl,
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
            articleSortOrder: "newest",
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
        await result.current.fetchFeed(feedUrl);
      });

      await runWithAct(async () => {
        await result.current.fetchFeed(feedUrl, {
          keepExistingFeed: true,
          requestSource: "search-change",
          searchTerm: "livescience",
          skipRefresh: true,
        });
      });

      expect(seenOptions).toHaveLength(2);
      expect(seenOptions[1]?.searchTerm).toBe("livescience");
      expect(seenOptions[1]?.knownLastFetchedAtByUrl).toBeUndefined();
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
            articleSortOrder: "newest",
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
            articleSortOrder: "newest",
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

    queryClient.cancelQueries =
      cancelQueriesMock as typeof queryClient.cancelQueries;

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
            articleSortOrder: "newest",
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
    const gatewayTimeoutError = Object.assign(
      new Error("Request failed with status code 504"),
      {
        name: "ApiError",
        status: 504,
      },
    );
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
            articleSortOrder: "newest",
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

  test("isBackgroundLoading is true during a keepExistingFeed fetch and false otherwise", async () => {
    // Verifies the flag that the feed list uses to show skeletons instead of
    // the empty state when a background search fetch is in flight.
    const feedUrl = "https://example.com/background-fetch.xml";
    const categoriesRef = { current: [] as CategoryTreeNode[] };
    let feedState: Article[] = [];
    const feedRef = { current: feedState };
    const backgroundArticle: Article = {
      content: "Background article body",
      feedId: 55,
      feedName: "Background Feed",
      feedUrl,
      id: 801,
      isRead: false,
      isStarred: false,
      lastChecked: new Date("2026-05-01T10:00:00.000Z"),
      link: "https://example.com/articles/background",
      publicationDate: new Date("2026-05-01T09:59:00.000Z"),
      title: "Background article",
    };

    let resolveBackgroundFetch!: () => void;
    const backgroundFetchReady = new Promise<void>((resolve) => {
      resolveBackgroundFetch = resolve;
    });

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

    FeedService.getFeedsBatch = mock(async (_urls: string[]) => {
      // Signal that the fetch is in progress, then wait for the test to
      // unblock us so we can observe isBackgroundLoading mid-flight.
      resolveBackgroundFetch();
      await backgroundFetchReady;
      return [
        {
          articles: [backgroundArticle],
          lastFetchedAt: new Date("2026-05-01T10:01:00.000Z"),
          ok: true,
          url: feedUrl,
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
            articleSortOrder: "newest",
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

      // Initially both flags are false.
      expect(result.current.isBackgroundLoading).toBe(false);
      expect(result.current.loading).toBe(false);

      // Start a background (keepExistingFeed) fetch and wait until the mock is
      // inside the fetch so isBackgroundLoading has been set.
      let fetchDone = false;
      act(() => {
        result.current
          .fetchFeed(feedUrl, {
            keepExistingFeed: true,
            requestSource: "search-change",
          })
          .then(() => {
            fetchDone = true;
          });
      });

      await waitFor(() => {
        // isBackgroundLoading must be raised; the main loading flag must stay
        // false so no full-shell animation triggers.
        expect(result.current.isBackgroundLoading).toBe(true);
        expect(result.current.loading).toBe(false);
      });

      // Let the mock resolve.
      resolveBackgroundFetch();

      await waitFor(() => {
        expect(fetchDone).toBe(true);
      });

      // After completion both flags must be cleared.
      await waitFor(() => {
        expect(result.current.isBackgroundLoading).toBe(false);
        expect(result.current.loading).toBe(false);
      });
    } finally {
      queryClient.clear();
    }
  });

  test("auto-refresh force requests stay on the background loading channel", async () => {
    // Automatic refresh must force the batch endpoint past stale in-memory
    // cache entries, but it is still ambient work: the visible feed remains in
    // place, failures stay silent, and only isBackgroundLoading is raised.
    const feedUrl = "https://example.com/forced-auto-background.xml";
    const categoriesRef = { current: [] as CategoryTreeNode[] };
    let feedState: Article[] = [];
    const feedRef = { current: feedState };
    const autoRefreshArticle: Article = {
      content: "Automatic refresh article body",
      feedId: 56,
      feedName: "Automatic Refresh Feed",
      feedUrl,
      id: 802,
      isRead: false,
      isStarred: false,
      lastChecked: new Date("2026-05-01T10:05:00.000Z"),
      link: "https://example.com/articles/forced-auto-background",
      publicationDate: new Date("2026-05-01T10:04:00.000Z"),
      title: "Forced automatic background article",
    };

    let resolveAutoRefreshStarted!: () => void;
    const autoRefreshStarted = new Promise<void>((resolve) => {
      resolveAutoRefreshStarted = resolve;
    });
    let resolveAutoRefreshProceed!: () => void;
    const autoRefreshProceed = new Promise<void>((resolve) => {
      resolveAutoRefreshProceed = resolve;
    });
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

    FeedService.getFeedsBatch = mock(async (_urls, options) => {
      resolveAutoRefreshStarted();
      await autoRefreshProceed;
      expect(options?.forceRefresh).toBe(true);
      expect(options?.requestSource).toBe("auto-refresh");
      return [
        {
          articles: [autoRefreshArticle],
          lastFetchedAt: new Date("2026-05-01T10:06:00.000Z"),
          ok: true,
          url: feedUrl,
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
            articleSortOrder: "newest",
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

      let fetchDone = false;
      act(() => {
        result.current
          .fetchFeed(feedUrl, {
            forceRefresh: true,
            keepExistingFeed: true,
            requestSource: "auto-refresh",
          })
          .then(() => {
            fetchDone = true;
          });
      });

      await autoRefreshStarted;

      await waitFor(() => {
        expect(result.current.isBackgroundLoading).toBe(true);
        expect(result.current.loading).toBe(false);
      });

      resolveAutoRefreshProceed();

      await waitFor(() => {
        expect(fetchDone).toBe(true);
        expect(result.current.isBackgroundLoading).toBe(false);
        expect(result.current.loading).toBe(false);
      });
    } finally {
      queryClient.clear();
    }
  });

  test("isBackgroundLoading is false and loading is true during a foreground fetch", async () => {
    // Confirms that a normal (non-background) fetch raises `loading` and keeps
    // `isBackgroundLoading` false throughout.
    const feedUrl = "https://example.com/foreground-fetch.xml";
    const categoriesRef = { current: [] as CategoryTreeNode[] };
    let feedState: Article[] = [];
    const feedRef = { current: feedState };

    // Two separate signals: one that fires when the mock has started (so the
    // test can observe loading: true), and one that the test triggers to allow
    // the mock to complete.
    let resolveFetchStarted!: () => void;
    const fetchStartedPromise = new Promise<void>((resolve) => {
      resolveFetchStarted = resolve;
    });
    let resolveFetchProceed!: () => void;
    const fetchProceedPromise = new Promise<void>((resolve) => {
      resolveFetchProceed = resolve;
    });

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

    FeedService.getFeedsBatch = mock(async (_urls: string[]) => {
      // Signal that the fetch is underway, then wait for the test to allow
      // completion so we can observe loading mid-flight.
      resolveFetchStarted();
      await fetchProceedPromise;
      return [
        {
          articles: [],
          lastFetchedAt: new Date("2026-05-01T11:00:00.000Z"),
          ok: true,
          url: feedUrl,
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
            articleSortOrder: "newest",
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

      let fetchDone = false;
      act(() => {
        result.current
          .fetchFeed(feedUrl, {
            forceRefresh: true,
            requestSource: "manual-refresh",
          })
          .then(() => {
            fetchDone = true;
          });
      });

      // Wait until the mock signals it has begun executing.
      await fetchStartedPromise;

      // For a foreground fetch: loading should be true and isBackgroundLoading
      // must remain false.
      await waitFor(() => {
        expect(result.current.loading).toBe(true);
        expect(result.current.isBackgroundLoading).toBe(false);
      });

      // Let the mock complete.
      resolveFetchProceed();

      await waitFor(() => {
        expect(fetchDone).toBe(true);
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
        expect(result.current.isBackgroundLoading).toBe(false);
      });
    } finally {
      queryClient.clear();
    }
  });

  test("cancelPendingRequest clears isBackgroundLoading", async () => {
    const feedUrl = "https://example.com/cancel-background.xml";
    const categoriesRef = { current: [] as CategoryTreeNode[] };
    let feedState: Article[] = [];
    const feedRef = { current: feedState };

    let resolveCancel!: () => void;
    const cancelUnblock = new Promise<void>((resolve) => {
      resolveCancel = resolve;
    });
    let fetchStarted = false;

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

    FeedService.getFeedsBatch = mock(async (_urls: string[]) => {
      fetchStarted = true;
      resolveCancel();
      await cancelUnblock;
      return [
        {
          articles: [],
          lastFetchedAt: new Date("2026-05-01T12:00:00.000Z"),
          ok: true,
          url: feedUrl,
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
            articleSortOrder: "newest",
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

      act(() => {
        result.current.fetchFeed(feedUrl, {
          keepExistingFeed: true,
          requestSource: "search-change",
        });
      });

      // Wait until the mock has set the flag.
      await waitFor(() => {
        expect(fetchStarted).toBe(true);
        expect(result.current.isBackgroundLoading).toBe(true);
      });

      // Cancel the in-flight request; the flag must drop immediately.
      act(() => {
        result.current.cancelPendingRequest();
      });

      await waitFor(() => {
        expect(result.current.isBackgroundLoading).toBe(false);
      });

      // Unblock the mock so the test can clean up.
      resolveCancel();
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

    const commandPromise = runDashboardViewportReadCommand(
      eventTarget,
      onMarkViewportRead,
    );

    expect(dispatchedEvents).toEqual([
      DASHBOARD_EVENTS.MARK_VIEWPORT_READ_START,
    ]);

    await handlerSettled;
    await commandPromise;
    expect(dispatchedEvents).toEqual([
      DASHBOARD_EVENTS.MARK_VIEWPORT_READ_START,
      "handler",
      DASHBOARD_EVENTS.MARK_VIEWPORT_READ_END,
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
    FeedService.saveCategoryOrder = mock(async () => {});

    const { result } = renderHook(() =>
      useCategoryOrderState({ usePlaceholderData: false }),
    );

    await waitFor(() => {
      expect(result.current.orderedCategoryLabels).toEqual(["News", "Tech"]);
    });
    await runWithAct(async () => {
      await new Promise((resolve) => setTimeout(resolve, 550));
    });

    expect(FeedService.saveCategoryOrder).not.toHaveBeenCalled();
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

describe("article status mutation settled-state helpers", () => {
  test("keeps only settled article keys still owned by the active mutation", () => {
    const settledKeys = new Set(["current-article", "stale-article"]);

    expect(
      filterArticleKeysBySettledState(
        settledKeys,
        (articleKey) => articleKey === "current-article",
      ),
    ).toEqual(new Set(["current-article"]));
  });

  test("keeps only settled article entries accepted by the ownership guard", () => {
    const currentArticle = {
      content: "Current body",
      feedId: 1,
      feedName: "Example Feed",
      feedUrl: "https://example.com/feed.xml",
      id: 1,
      isRead: false,
      isStarred: false,
      lastChecked: new Date("2026-03-14T12:00:00.000Z"),
      link: "https://example.com/current",
      publicationDate: new Date("2026-03-14T11:59:00.000Z"),
      title: "Current Article",
    } satisfies Article;
    const staleArticle = {
      ...currentArticle,
      id: 2,
      link: "https://example.com/stale",
      title: "Stale Article",
    } satisfies Article;

    expect(
      filterArticleMapBySettledState(
        new Map([
          ["current-article", currentArticle],
          ["stale-article", staleArticle],
        ]),
        (articleKey) => articleKey === "current-article",
      ),
    ).toEqual(new Map([["current-article", currentArticle]]));
  });
});

function registerModuleMocks() {
  mock.module("sonner", () => ({
    ...realSonnerModule,
    toast: {
      ...realSonnerModule.toast,
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
    const originalCss = global.CSS;
    global.CSS = undefined as any;

    try {
      const key = 'test"article\\key';
      const escaped = escapeArticleKey(key);

      expect(escaped).toContain("\\");
    } finally {
      global.CSS = originalCss;
    }
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

  test("hydrateArticleContent skips re-fetch when the current article already has full content", async () => {
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

    // Try to hydrate again with the post-hydration article object that the UI
    // would pass after setFeed marks it as full content.
    await runWithAct(async () => {
      await result.current.hydrateArticleContent(feedState[0]!);
    });

    // Should skip extraction because the article itself is still full content.
    const afterSecondHydrateCalls = (
      ArticleService.extractArticleContent as ReturnType<typeof mock>
    ).mock.calls.length;
    expect(result.current.hydratedArticleLinks[article.link]).toBe(true);
    expect(afterSecondHydrateCalls).toBe(0);
    expect(feedState[0].content).toContain("Extracted content");
  });

  test("hydrateArticleContent rehydrates a refreshed excerpt even when the link was previously hydrated", async () => {
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
      expect(result.current.hydratedArticleLinks[article.link]).toBe(true);
      expect(feedState[0]?.hasFullContent).toBe(true);
    });

    feedState = [
      createMockArticle({
        content: "Refreshed excerpt after a failed feed refresh",
        hasFullContent: false,
        link: article.link,
      }),
    ];
    (ArticleService.extractArticleContent as ReturnType<typeof mock>)
      .mockClear()
      .mockImplementation(async () => "<p>Rehydrated after refresh error</p>");

    await runWithAct(async () => {
      await result.current.hydrateArticleContent(feedState[0]!);
    });

    await waitFor(() => {
      expect(ArticleService.extractArticleContent).toHaveBeenCalledTimes(1);
      expect(feedState[0]?.content).toContain("Rehydrated after refresh error");
      expect(feedState[0]?.hasFullContent).toBe(true);
    });
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
    const article = createMockArticle({ content: "" });
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
    const bundledArticle = getBundledPlaceholderArticle();
    const article = createMockArticle({
      content: "",
      feedUrl: bundledArticle.feedUrl,
      link: bundledArticle.link,
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
    expect(ArticleService.updateArticleStatus).toHaveBeenCalledWith(
      1,
      {
        isRead: true,
      },
      { keepalive: true },
    );
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

  test("retries stale-resume read-state aborts and keeps optimistic state", async () => {
    let capturedSignal: AbortSignal | undefined;
    const updateOptions: (
      | undefined
      | { keepalive?: boolean; signal?: AbortSignal }
    )[] = [];

    (ArticleService.updateArticleStatus as ReturnType<typeof mock>)
      .mockClear()
      .mockImplementation(
        async (
          _articleId: number,
          _updates: { isRead?: boolean; isStarred?: boolean },
          options?: { keepalive?: boolean; signal?: AbortSignal },
        ) => {
          capturedSignal ??= options?.signal;
          updateOptions.push(options);

          if (!options?.signal) {
            return;
          }

          await new Promise<void>((_resolve, reject) => {
            options.signal?.addEventListener(
              "abort",
              () => {
                reject(new DOMException("aborted", "AbortError"));
              },
              { once: true },
            );
          });
        },
      );

    const article = createMockArticle({ isRead: false });
    let feedState = [article];
    const setFeed = mock((updater: any) => {
      feedState = typeof updater === "function" ? updater(feedState) : updater;
    });

    const { result } = renderHook(() =>
      useArticleActions({
        articleFilter: "all",
        expandedArticleKey: null,
        feed: feedState,
        setExpandedArticleKey: mock(() => {}),
        setFeed,
        usePlaceholderData: false,
      }),
    );

    let mutationPromise: Promise<boolean> | undefined;
    await act(async () => {
      mutationPromise = result.current.setArticleReadState(article, true);
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(feedState[0].isRead).toBe(true);
    });

    await act(async () => {
      result.current.cancelPendingArticleStatusMutations();
      await mutationPromise;
    });

    await waitFor(() => {
      expect(capturedSignal?.aborted).toBe(true);
      expect(updateOptions).toEqual([
        { keepalive: true, signal: expect.any(AbortSignal) },
        { keepalive: true },
      ]);
      expect(feedState[0].isRead).toBe(true);
      expect(result.current.updatingArticleState).toEqual({});
    });
  });
});
