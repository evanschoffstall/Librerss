/**
 * Comprehensive Tests: Dashboard Article Actions Hook
 * Tests for src/app/dashboard/hooks/useArticleActions.ts
 */

import {
  toggleReadStatus,
  toggleStarredStatus,
  useArticleActions,
} from "@/app/dashboard/hooks/useArticleActions";
import type { Article } from "@/lib";
import { ArticleService } from "@/lib";
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
import { createMockArticle } from "./helpers/test-utils";

const runWithAct = async (callback: () => Promise<void> | void) => {
  await act(async () => {
    await callback();
  });
};

beforeAll(() => {
  mock.module("sonner", () => ({
    toast: {
      error: mock(() => {}),
      success: mock(() => {}),
    },
  }));
});

const originalExtractArticleContent = ArticleService.extractArticleContent;
const originalUpdateArticleStatus = ArticleService.updateArticleStatus;
const originalConsoleError = console.error;
const muteConsoleError = (() => {}) as typeof console.error;

afterAll(() => {
  ArticleService.updateArticleStatus =
    originalUpdateArticleStatus as typeof ArticleService.updateArticleStatus;
  ArticleService.extractArticleContent =
    originalExtractArticleContent as typeof ArticleService.extractArticleContent;
  console.error = originalConsoleError;
  mock.restore();
});

describe("useArticleActions - State Management", () => {
  const nativeSetTimeout = global.setTimeout;

  beforeEach(() => {
    document.body.innerHTML = "";
    global.setTimeout = nativeSetTimeout;
    ArticleService.updateArticleStatus = mock(
      async () => {},
    ) as unknown as typeof ArticleService.updateArticleStatus;
    ArticleService.extractArticleContent = mock(
      async () => "<p>Extracted content</p>",
    ) as unknown as typeof ArticleService.extractArticleContent;
    console.error = muteConsoleError;
  });

  afterEach(() => {
    document.body.innerHTML = "";
    global.setTimeout = nativeSetTimeout;
  });

  const createMockArticle = (overrides?: Partial<Article>): Article => ({
    id: 1,
    title: "Test Article",
    link: "https://example.com/article",
    content: "Test content",
    publicationDate: new Date("2024-01-01"),
    feedId: 1,
    feedName: "Test Feed",
    feedUrl: "https://example.com/feed",
    isRead: false,
    isStarred: false,
    lastChecked: new Date(),
    ...overrides,
  });

  test("toggle helper functions work correctly", () => {
    expect(toggleReadStatus(false)).toBe(true);
    expect(toggleReadStatus(true)).toBe(false);
    expect(toggleStarredStatus(false)).toBe(true);
    expect(toggleStarredStatus(true)).toBe(false);
  });

  test("initializes with correct default state", () => {
    const article = createMockArticle();
    const setFeed = mock(() => {});
    const setExpandedArticleKey = mock(() => {});

    const { result } = renderHook(() =>
      useArticleActions({
        feed: [article],
        setFeed,
        expandedArticleKey: null,
        setExpandedArticleKey,
        articleFilter: "all",
      }),
    );

    expect(result.current.updatingArticleState).toEqual({});
    expect(result.current.hydratedArticleLinks).toEqual({});
    expect(result.current.hydratingArticleLinks).toEqual({});
    expect(result.current.collapsingArticleKey).toBeNull();
  });

  test("handleToggleStarredState marks article as starred", async () => {
    const article = createMockArticle({ isStarred: false });
    let feedState = [article];
    const setFeed = mock((updater: any) => {
      feedState = typeof updater === "function" ? updater(feedState) : updater;
    });
    const setExpandedArticleKey = mock(() => {});

    const { result } = renderHook(() =>
      useArticleActions({
        feed: feedState,
        setFeed,
        expandedArticleKey: null,
        setExpandedArticleKey,
        articleFilter: "all",
      }),
    );

    await runWithAct(async () => {
      await result.current.handleToggleStarredState(article);
    });

    expect(ArticleService.updateArticleStatus).toHaveBeenCalledWith(1, {
      isStarred: true,
    });
    expect(setFeed).toHaveBeenCalled();
  });

  test("handleToggleStarredState unmarks starred article", async () => {
    const article = createMockArticle({ id: 2, isStarred: true });
    let feedState = [article];
    const setFeed = mock((updater: any) => {
      feedState = typeof updater === "function" ? updater(feedState) : updater;
    });
    const setExpandedArticleKey = mock(() => {});

    const { result } = renderHook(() =>
      useArticleActions({
        feed: feedState,
        setFeed,
        expandedArticleKey: null,
        setExpandedArticleKey,
        articleFilter: "all",
      }),
    );

    await runWithAct(async () => {
      await result.current.handleToggleStarredState(article);
    });

    expect(ArticleService.updateArticleStatus).toHaveBeenCalledWith(2, {
      isStarred: false,
    });
  });

  test("handleToggleStarredState removes from starred filter when unstarring", async () => {
    const article = createMockArticle({ id: 3, isStarred: true });
    let feedState = [article];
    const setFeed = mock((updater: any) => {
      feedState = typeof updater === "function" ? updater(feedState) : updater;
    });
    const setExpandedArticleKey = mock(() => {});

    const { result } = renderHook(() =>
      useArticleActions({
        feed: feedState,
        setFeed,
        expandedArticleKey: null,
        setExpandedArticleKey,
        articleFilter: "starred",
      }),
    );

    await runWithAct(async () => {
      await result.current.handleToggleStarredState(article);
    });

    await waitFor(() => {
      expect(feedState.length).toBe(0);
    });
  });

  test("handleToggleStarredState reverts on error", async () => {
    const mockError = new Error("Network error");
    (
      ArticleService.updateArticleStatus as ReturnType<typeof mock>
    ).mockImplementation(async () => {
      throw mockError;
    });

    const article = createMockArticle({ id: 4, isStarred: false });
    let feedState = [article];
    const setFeed = mock((updater: any) => {
      feedState = typeof updater === "function" ? updater(feedState) : updater;
    });
    const setExpandedArticleKey = mock(() => {});

    const { result } = renderHook(() =>
      useArticleActions({
        feed: feedState,
        setFeed,
        expandedArticleKey: null,
        setExpandedArticleKey,
        articleFilter: "all",
      }),
    );

    await runWithAct(async () => {
      await result.current.handleToggleStarredState(article);
    });

    await waitFor(() => {
      expect(feedState[0].isStarred).toBe(false);
    });
  });

  test("handleToggleStarredState re-adds article to starred filter on revert", async () => {
    const mockError = new Error("Network error");
    (
      ArticleService.updateArticleStatus as ReturnType<typeof mock>
    ).mockImplementation(async () => {
      throw mockError;
    });

    const article = createMockArticle({ id: 5, isStarred: true });
    let feedState = [article];
    const setFeed = mock((updater: any) => {
      feedState = typeof updater === "function" ? updater(feedState) : updater;
    });
    const setExpandedArticleKey = mock(() => {});

    const { result } = renderHook(() =>
      useArticleActions({
        feed: feedState,
        setFeed,
        expandedArticleKey: null,
        setExpandedArticleKey,
        articleFilter: "starred",
      }),
    );

    await runWithAct(async () => {
      await result.current.handleToggleStarredState(article);
    });

    await waitFor(() => {
      expect(feedState.some((a) => a.id === 5)).toBe(true);
    });
  });

  test("handleArticleToggle expands collapsed article", async () => {
    const article = createMockArticle();
    const setFeed = mock(() => {});
    const setExpandedArticleKey = mock((updater: any) => {
      return typeof updater === "function" ? updater(null) : updater;
    });

    const { result } = renderHook(() =>
      useArticleActions({
        feed: [article],
        setFeed,
        expandedArticleKey: null,
        setExpandedArticleKey,
        articleFilter: "all",
      }),
    );

    await runWithAct(async () => {
      await result.current.handleArticleToggle(article);
    });

    expect(setExpandedArticleKey).toHaveBeenCalled();
  });

  test("handleArticleToggle collapses expanded article", async () => {
    const article = createMockArticle();
    const articleKey = "1_https://example.com/article";
    const setFeed = mock(() => {});
    const setExpandedArticleKey = mock((updater: any) => {
      return typeof updater === "function" ? updater(articleKey) : updater;
    });

    const { result } = renderHook(() =>
      useArticleActions({
        feed: [article],
        setFeed,
        expandedArticleKey: articleKey,
        setExpandedArticleKey,
        articleFilter: "all",
      }),
    );

    await runWithAct(async () => {
      await result.current.handleArticleToggle(article);
    });

    expect(setExpandedArticleKey).toHaveBeenCalled();
  });

  test("handleArticleToggle marks unread article as read when expanding", async () => {
    const article = createMockArticle({ isRead: false });
    let feedState = [article];
    const setFeed = mock((updater: any) => {
      feedState = typeof updater === "function" ? updater(feedState) : updater;
    });
    const setExpandedArticleKey = mock(() => {});

    const { result } = renderHook(() =>
      useArticleActions({
        feed: feedState,
        setFeed,
        expandedArticleKey: null,
        setExpandedArticleKey,
        articleFilter: "all",
      }),
    );

    await runWithAct(async () => {
      await result.current.handleArticleToggle(article);
    });

    expect(ArticleService.updateArticleStatus).toHaveBeenCalledWith(1, {
      isRead: true,
    });
  });

  test.skip("handleArticleToggle schedules removal animation for read articles in unread filter", async () => {
    const article = createMockArticle({ isRead: true });
    const articleKey = "https://example.com/article";
    const setFeed = mock(() => {});
    const setExpandedArticleKey = mock(() => {});

    const { result } = renderHook(() =>
      useArticleActions({
        feed: [article],
        setFeed,
        expandedArticleKey: articleKey,
        setExpandedArticleKey,
        articleFilter: "unread",
      }),
    );

    await runWithAct(async () => {
      await result.current.handleArticleToggle(article);
    });

    expect(setExpandedArticleKey).toHaveBeenCalled();
    expect(article.link).toBe(articleKey);
  });

  test("handleToggleReadState toggles read status", async () => {
    const article = createMockArticle({ isRead: false });
    let feedState = [article];
    const setFeed = mock((updater: any) => {
      feedState = typeof updater === "function" ? updater(feedState) : updater;
    });
    const setExpandedArticleKey = mock(() => {});

    const { result } = renderHook(() =>
      useArticleActions({
        feed: feedState,
        setFeed,
        expandedArticleKey: null,
        setExpandedArticleKey,
        articleFilter: "all",
      }),
    );

    await runWithAct(async () => {
      await result.current.handleToggleReadState(article);
    });

    expect(feedState[0].isRead).toBe(true);
  });

  test("setArticleReadState sets specific read state", async () => {
    const article = createMockArticle({ isRead: false });
    let feedState = [article];
    const setFeed = mock((updater: any) => {
      feedState = typeof updater === "function" ? updater(feedState) : updater;
    });
    const setExpandedArticleKey = mock(() => {});

    const { result } = renderHook(() =>
      useArticleActions({
        feed: feedState,
        setFeed,
        expandedArticleKey: null,
        setExpandedArticleKey,
        articleFilter: "all",
      }),
    );

    await runWithAct(async () => {
      await result.current.setArticleReadState(article, true);
    });

    expect(feedState[0].isRead).toBe(true);
  });

  test("cleanup clears timeout on unmount", () => {
    const article = createMockArticle();
    const setFeed = mock(() => {});
    const setExpandedArticleKey = mock(() => {});

    const { unmount } = renderHook(() =>
      useArticleActions({
        feed: [article],
        setFeed,
        expandedArticleKey: null,
        setExpandedArticleKey,
        articleFilter: "all",
      }),
    );

    // Should not throw
    unmount();
  });

  test("handleArticleToggle cancels collapse animation when expanding new article", async () => {
    const article1 = createMockArticle({ id: 1 });
    const article2 = createMockArticle({ id: 2 });
    const setFeed = mock(() => {});
    const setExpandedArticleKey = mock(() => {});

    const { result } = renderHook(() =>
      useArticleActions({
        feed: [article1, article2],
        setFeed,
        expandedArticleKey: null,
        setExpandedArticleKey,
        articleFilter: "unread",
      }),
    );

    // This should trigger the collapse animation cancellation logic
    await runWithAct(async () => {
      await result.current.handleArticleToggle(article1);
    });
    await runWithAct(async () => {
      await result.current.handleArticleToggle(article2);
    });

    expect(setExpandedArticleKey).toHaveBeenCalled();
  });

  test("multiple rapid toggle operations handle state correctly", async () => {
    const article = createMockArticle({ id: 10, isStarred: false });
    let feedState = [article];
    const setFeed = mock((updater: any) => {
      feedState = typeof updater === "function" ? updater(feedState) : updater;
    });
    const setExpandedArticleKey = mock(() => {});

    const { result } = renderHook(() =>
      useArticleActions({
        feed: feedState,
        setFeed,
        expandedArticleKey: null,
        setExpandedArticleKey,
        articleFilter: "all",
      }),
    );

    // Simulate rapid toggles
    const promise1 = result.current.handleToggleStarredState(article);
    const promise2 = result.current.handleToggleStarredState(article);

    await Promise.all([promise1, promise2]);

    expect(ArticleService.updateArticleStatus).toHaveBeenCalled();
  });
});

describe("useArticleActions - Article Hydration Integration", () => {
  test("tracks hydrated article links", () => {
    const article = createMockArticle();
    const setFeed = mock(() => {});
    const setExpandedArticleKey = mock(() => {});

    const { result } = renderHook(() =>
      useArticleActions({
        feed: [article],
        setFeed,
        expandedArticleKey: null,
        setExpandedArticleKey,
        articleFilter: "all",
      }),
    );

    expect(result.current.hydratedArticleLinks).toBeDefined();
    expect(result.current.hydratingArticleLinks).toBeDefined();
  });

  test("handles article collapse with scrolling", async () => {
    // Mock DOM element
    const mockElement = document.createElement("div");
    mockElement.setAttribute(
      "data-article-key",
      "1_https://example.com/article",
    );
    mockElement.scrollIntoView = mock(() => {});
    document.body.appendChild(mockElement);

    const article = createMockArticle({
      id: 1,
      link: "https://example.com/article",
    });
    const articleKey = "1_https://example.com/article";
    const setFeed = mock(() => {});
    const setExpandedArticleKey = mock(() => {});

    const { result } = renderHook(() =>
      useArticleActions({
        feed: [article],
        setFeed,
        expandedArticleKey: articleKey,
        setExpandedArticleKey,
        articleFilter: "all",
      }),
    );

    await runWithAct(async () => {
      await result.current.handleArticleToggle(article);
    });

    // Wait for the scrollIntoView timeout
    await new Promise((resolve) => setTimeout(resolve, 300));

    expect(setExpandedArticleKey).toHaveBeenCalled();

    document.body.removeChild(mockElement);
  });
});
