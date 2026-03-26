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
    test
} from "bun:test";
import { createElement } from "react";
import { toast } from "sonner";

import { DASHBOARD_EVENTS } from "@/app/dashboard/constants";
import {
    escapeArticleKey,
    useArticleHydration
} from "@/app/dashboard/hooks/useArticleHydration";
import {
    getNextArticle,
    getPreviousArticle
} from "@/app/dashboard/hooks/useArticleNavigation";
import { useArticleReadState } from "@/app/dashboard/hooks/useArticleReadState";
import { useCategoryOrderState } from "@/app/dashboard/hooks/useCategoryOrderState";
import { useDashboardEvents } from "@/app/dashboard/hooks/useDashboardEvents";
import {
    shouldShowNoFeedSourcesToast,
    useFeedLoader
} from "@/app/dashboard/hooks/useFeedLoader";
import { canRefreshFeed } from "@/app/dashboard/hooks/useFeedRefresh";
import {
    toggleReadStatus,
    toggleStarredStatus
} from "@/app/dashboard/services/article-status-toggle";
import { type FeedBatchSource } from "@/app/dashboard/services/feed-batch";
import { buildFeedBatchOutcome } from "@/app/dashboard/services/feed-batch-outcome";
import {
    type Article, ArticleService, type CategoryTreeNode, FeedService
} from "@/lib";


// ─── useArticleNavigation ─────────────────────────────────────────────────────

describe("useArticleNavigation", () => {
  test("getNextArticle returns next article in list", () => {
    const articles = [
      { id: 1, title: "Article 1" },
      { id: 2, title: "Article 2" },
      { id: 3, title: "Article 3" },
    ];
    const next = getNextArticle(articles, 1);
    expect(next?.id).toBe(2);
  });

  test("getNextArticle returns null at end of list", () => {
    const articles = [
      { id: 1, title: "Article 1" },
      { id: 2, title: "Article 2" },
    ];
    const next = getNextArticle(articles, 2);
    expect(next).toBeNull();
  });

  test("getPreviousArticle returns previous article in list", () => {
    const articles = [
      { id: 1, title: "Article 1" },
      { id: 2, title: "Article 2" },
      { id: 3, title: "Article 3" },
    ];
    const prev = getPreviousArticle(articles, 3);
    expect(prev?.id).toBe(2);
  });

  test("getPreviousArticle returns null at start of list", () => {
    const articles = [
      { id: 1, title: "Article 1" },
      { id: 2, title: "Article 2" },
    ];
    const prev = getPreviousArticle(articles, 1);
    expect(prev).toBeNull();
  });
});

// ─── useFeedRefresh ───────────────────────────────────────────────────────────

describe("useFeedRefresh", () => {
  test("canRefreshFeed checks last refresh time", () => {
    const recentlyRefreshed = {
      id: 1,
      lastFetchedAt: new Date(Date.now() - 1000), // 1 second ago
    };
    const longAgo = {
      id: 2,
      lastFetchedAt: new Date(Date.now() - 10 * 60 * 1000), // 10 minutes ago
    };

    expect(canRefreshFeed(recentlyRefreshed, 5 * 60 * 1000)).toBe(false);
    expect(canRefreshFeed(longAgo, 5 * 60 * 1000)).toBe(true);
  });

  test("canRefreshFeed allows refresh if never fetched", () => {
    const neverFetched = {
      id: 1,
      lastFetchedAt: null,
    };

    expect(canRefreshFeed(neverFetched, 5 * 60 * 1000)).toBe(true);
  });
});

describe("useFeedLoader", () => {
  test("suppresses the empty-source toast in placeholder mode", () => {
    expect(shouldShowNoFeedSourcesToast(false, true)).toBe(false);
    expect(shouldShowNoFeedSourcesToast(false, false)).toBe(true);
    expect(shouldShowNoFeedSourcesToast(true, false)).toBe(false);
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
    const onMarkViewportRead = mock(async () => {});

    renderHook(() =>
      useDashboardEvents({
        onMarkViewportRead,
        onOpenFeedsSidebar: () => {},
        onOpenSettings: () => {},
        onRefresh: async () => {},
        onSearchChange: () => {},
        selectedCategory: "system-all-feeds",
        selectedCategoryNode: undefined,
        selectedFeedUrl: undefined,
      }),
    );

    act(() => {
      window.dispatchEvent(new CustomEvent(DASHBOARD_EVENTS.MARK_VIEWPORT_READ));
    });

    await waitFor(() => {
      expect(onMarkViewportRead).toHaveBeenCalledTimes(1);
    });

    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.info).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
  });

  test("keeps the viewport command silent when there are no visible unread articles", async () => {
    const onMarkViewportRead = mock(async () => {});

    renderHook(() =>
      useDashboardEvents({
        onMarkViewportRead,
        onOpenFeedsSidebar: () => {},
        onOpenSettings: () => {},
        onRefresh: async () => {},
        onSearchChange: () => {},
        selectedCategory: "system-all-feeds",
        selectedCategoryNode: undefined,
        selectedFeedUrl: undefined,
      }),
    );

    act(() => {
      window.dispatchEvent(new CustomEvent(DASHBOARD_EVENTS.MARK_VIEWPORT_READ));
    });

    await waitFor(() => {
      expect(onMarkViewportRead).toHaveBeenCalledTimes(1);
    });

    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.info).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
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
});

// ─── useArticleActions ────────────────────────────────────────────────────────

describe("useArticleActions", () => {
  test("toggleRead switches read status", () => {
    expect(toggleReadStatus(true)).toBe(false);
    expect(toggleReadStatus(false)).toBe(true);
  });

  test("toggleStarred switches starred status", () => {
    expect(toggleStarredStatus(true)).toBe(false);
    expect(toggleStarredStatus(false)).toBe(true);
  });
});

function registerModuleMocks() {
  mock.module("sonner", () => ({
    toast: {
      error: mock(() => {}),
      info: mock(() => {}),
      success: mock(() => {}),
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
const originalClientFeedRefreshDiagnosticsEnabled =
  process.env.NEXT_PUBLIC_FEED_REFRESH_DIAGNOSTICS_ENABLED;
const muteConsoleError = (() => {}) as typeof console.error;
const muteConsoleInfo = (() => {}) as typeof console.info;

beforeEach(() => {
  process.env.NEXT_PUBLIC_FEED_REFRESH_DIAGNOSTICS_ENABLED = "false";
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
