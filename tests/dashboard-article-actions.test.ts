/**
 * Comprehensive Tests: Dashboard Article Actions Hook
 * Tests for src/app/dashboard/hooks/useArticleActions.ts
 */

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

import { act, renderHook, waitFor } from "@testing-library/react";

import { createMockArticle } from "./support/test-utils";

import {
  toggleReadStatus,
  toggleStarredStatus,
  useArticleActions,
} from "@/app/dashboard/hooks/useArticleActions";
import type { Article } from "@/lib";
import { ArticleService } from "@/lib";

beforeEach(() => mock.restore());
afterEach(() => mock.restore());

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
    content: "Test content",
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
        articleFilter: "all",
        expandedArticleKey: null,
        feed: [article],
        setExpandedArticleKey,
        setFeed,
      }),
    );

    expect(result.current.updatingArticleState).toEqual({});
    expect(result.current.hydratedArticleLinks).toEqual({});
    expect(result.current.hydratingArticleLinks).toEqual({});
    expect(result.current.collapsingArticleKey).toBeNull();
    expect(result.current.collapsingArticleMode).toBeNull();
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
        articleFilter: "all",
        expandedArticleKey: null,
        feed: feedState,
        setExpandedArticleKey,
        setFeed,
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
        articleFilter: "all",
        expandedArticleKey: null,
        feed: feedState,
        setExpandedArticleKey,
        setFeed,
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
        articleFilter: "starred",
        expandedArticleKey: null,
        feed: feedState,
        setExpandedArticleKey,
        setFeed,
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
        articleFilter: "all",
        expandedArticleKey: null,
        feed: feedState,
        setExpandedArticleKey,
        setFeed,
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
        articleFilter: "starred",
        expandedArticleKey: null,
        feed: feedState,
        setExpandedArticleKey,
        setFeed,
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
        articleFilter: "all",
        expandedArticleKey: null,
        feed: [article],
        setExpandedArticleKey,
        setFeed,
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
        articleFilter: "all",
        expandedArticleKey: articleKey,
        feed: [article],
        setExpandedArticleKey,
        setFeed,
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
        articleFilter: "all",
        expandedArticleKey: null,
        feed: feedState,
        setExpandedArticleKey,
        setFeed,
      }),
    );

    await runWithAct(async () => {
      await result.current.handleArticleToggle(article);
    });

    expect(ArticleService.updateArticleStatus).toHaveBeenCalledWith(1, {
      isRead: true,
    });
  });

  test("handleArticleToggle schedules removal animation for read articles in unread filter", async () => {
    const article = createMockArticle({ isRead: true });
    const articleKey = "https://example.com/article";
    const setFeed = mock(() => {});
    const setExpandedArticleKey = mock(() => {});

    const { result } = renderHook(() =>
      useArticleActions({
        articleFilter: "unread",
        expandedArticleKey: articleKey,
        feed: [article],
        setExpandedArticleKey,
        setFeed,
      }),
    );

    await runWithAct(async () => {
      await result.current.handleArticleToggle(article);
    });

    expect(setExpandedArticleKey).toHaveBeenCalled();
    expect(result.current.collapsingArticleKey).toBe(articleKey);
    expect(result.current.collapsingArticleMode).toBe("de-expanding");
  });

  test("handleArticleToggle treats expanded unread articles as read when collapsing in unread filter", async () => {
    const article = createMockArticle({
      id: 22,
      isRead: false,
      link: "https://example.com/expanded-unread-collapse",
    });
    const setFeed = mock(() => {});
    const setExpandedArticleKey = mock(() => {});

    const { result } = renderHook(() =>
      useArticleActions({
        articleFilter: "unread",
        expandedArticleKey: article.link,
        feed: [article],
        setExpandedArticleKey,
        setFeed,
      }),
    );

    await runWithAct(async () => {
      await result.current.handleArticleToggle(article);
    });

    expect(result.current.collapsingArticleKey).toBe(article.link);
    expect(result.current.collapsingArticleMode).toBe("de-expanding");
    expect(setExpandedArticleKey).toHaveBeenCalled();
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
        articleFilter: "all",
        expandedArticleKey: null,
        feed: feedState,
        setExpandedArticleKey,
        setFeed,
      }),
    );

    await runWithAct(async () => {
      await result.current.handleToggleReadState(article);
    });

    expect(feedState[0].isRead).toBe(true);
  });

  test("handleToggleReadState stages unread-filter removals for animation", async () => {
    const article = createMockArticle({
      id: 12,
      isRead: false,
      link: "https://example.com/animated-removal",
    });
    let feedState = [article];
    const setFeed = mock((updater: any) => {
      feedState = typeof updater === "function" ? updater(feedState) : updater;
    });
    const setExpandedArticleKey = mock(() => {});

    const { result } = renderHook(() =>
      useArticleActions({
        articleFilter: "unread",
        expandedArticleKey: null,
        feed: feedState,
        setExpandedArticleKey,
        setFeed,
      }),
    );

    await runWithAct(async () => {
      await result.current.handleToggleReadState(article);
    });

    expect(feedState[0].isRead).toBe(true);
    expect(result.current.collapsingArticleKey).toBe(article.link);
    expect(result.current.collapsingArticleMode).toBe("collapse");
  });

  test("handleSwipeRead stages unread-filter removals with the swipe animation", async () => {
    const article = createMockArticle({
      id: 13,
      isRead: false,
      link: "https://example.com/swipe-removal",
    });
    let feedState = [article];
    const setFeed = mock((updater: any) => {
      feedState = typeof updater === "function" ? updater(feedState) : updater;
    });
    const setExpandedArticleKey = mock(() => {});

    const { result } = renderHook(() =>
      useArticleActions({
        articleFilter: "unread",
        expandedArticleKey: null,
        feed: feedState,
        setExpandedArticleKey,
        setFeed,
      }),
    );

    await runWithAct(async () => {
      await result.current.handleSwipeRead(article);
    });

    expect(feedState[0].isRead).toBe(true);
    expect(result.current.collapsingArticleKey).toBe(article.link);
    expect(result.current.collapsingArticleMode).toBe("swipe-read");
  });

  test("collapsing an already-read expanded article stages the de-expansion hold", async () => {
    const article = createMockArticle({ isRead: true });
    const setFeed = mock(() => {});
    const setExpandedArticleKey = mock(() => {});

    const { result } = renderHook(() =>
      useArticleActions({
        articleFilter: "unread",
        expandedArticleKey: article.link,
        feed: [article],
        setExpandedArticleKey,
        setFeed,
      }),
    );

    await runWithAct(async () => {
      await result.current.handleArticleToggle(article);
    });

    expect(result.current.collapsingArticleKey).toBe(article.link);
    expect(result.current.collapsingArticleMode).toBe("de-expanding");
    expect(setExpandedArticleKey).toHaveBeenCalled();
  });

  test("handleExpandedSwipeRead marks article read and collapses without toggling", async () => {
    const article = createMockArticle({
      id: 11,
      isRead: false,
      link: "https://example.com/swipe-read",
    });
    const articleKey = article.link;
    let feedState = [article];
    const setFeed = mock((updater: any) => {
      feedState = typeof updater === "function" ? updater(feedState) : updater;
    });
    const setExpandedArticleKey = mock((updater: any) =>
      typeof updater === "function" ? updater(articleKey) : updater,
    );

    const { result } = renderHook(() =>
      useArticleActions({
        articleFilter: "unread",
        expandedArticleKey: articleKey,
        feed: feedState,
        setExpandedArticleKey,
        setFeed,
      }),
    );

    await runWithAct(async () => {
      result.current.handleExpandedSwipeRead(article);
      await Promise.resolve();
    });

    expect(feedState[0].isRead).toBe(true);
    expect(ArticleService.updateArticleStatus).toHaveBeenCalledWith(11, {
      isRead: true,
    });
    expect(result.current.collapsingArticleMode).toBe("swipe-read");
    expect(setExpandedArticleKey).toHaveBeenCalled();
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
        articleFilter: "all",
        expandedArticleKey: null,
        feed: feedState,
        setExpandedArticleKey,
        setFeed,
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
        articleFilter: "all",
        expandedArticleKey: null,
        feed: [article],
        setExpandedArticleKey,
        setFeed,
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
        articleFilter: "unread",
        expandedArticleKey: null,
        feed: [article1, article2],
        setExpandedArticleKey,
        setFeed,
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
        articleFilter: "all",
        expandedArticleKey: null,
        feed: feedState,
        setExpandedArticleKey,
        setFeed,
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
        articleFilter: "all",
        expandedArticleKey: null,
        feed: [article],
        setExpandedArticleKey,
        setFeed,
      }),
    );

    expect(result.current.hydratedArticleLinks).toBeDefined();
    expect(result.current.hydratingArticleLinks).toBeDefined();
  });

  test("re-expanding the same article does not re-extract", async () => {
    const article = createMockArticle({
      id: 42,
      link: "https://example.com/reexpand",
    });
    let expandedArticleKey: null | string = null;
    const setFeed = mock(() => {});
    const setExpandedArticleKey = mock((updater: any) => {
      expandedArticleKey =
        typeof updater === "function" ? updater(expandedArticleKey) : updater;
    });

    const { rerender, result } = renderHook(
      ({ expandedKey }) =>
        useArticleActions({
          articleFilter: "all",
          expandedArticleKey: expandedKey,
          feed: [article],
          setExpandedArticleKey,
          setFeed,
        }),
      {
        initialProps: { expandedKey: expandedArticleKey },
      },
    );

    await runWithAct(async () => {
      await result.current.handleArticleToggle(article);
    });
    rerender({ expandedKey: expandedArticleKey });

    await waitFor(() => {
      expect(ArticleService.extractArticleContent).toHaveBeenCalledTimes(1);
    });

    await runWithAct(async () => {
      await result.current.handleArticleToggle(article);
    });
    rerender({ expandedKey: expandedArticleKey });

    await runWithAct(async () => {
      await result.current.handleArticleToggle(article);
    });
    rerender({ expandedKey: expandedArticleKey });

    await waitFor(() => {
      expect(ArticleService.extractArticleContent).toHaveBeenCalledTimes(1);
    });
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
        articleFilter: "all",
        expandedArticleKey: articleKey,
        feed: [article],
        setExpandedArticleKey,
        setFeed,
      }),
    );

    await runWithAct(async () => {
      await result.current.handleArticleToggle(article);
    });

    // Wait for the scrollIntoView timeout (reduced for tests)
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(setExpandedArticleKey).toHaveBeenCalled();

    document.body.removeChild(mockElement);
  });

  test("collapse scroll does not move viewport when card remains visible", async () => {
    const viewport = document.createElement("div");
    viewport.setAttribute("data-radix-scroll-area-viewport", "");
    Object.defineProperty(viewport, "scrollTop", {
      configurable: true,
      value: 600,
      writable: true,
    });
    Object.defineProperty(viewport, "scrollHeight", {
      configurable: true,
      value: 2000,
    });
    Object.defineProperty(viewport, "clientHeight", {
      configurable: true,
      value: 400,
    });
    viewport.getBoundingClientRect = () =>
      ({
        bottom: 500,
        height: 400,
        left: 0,
        right: 500,
        toJSON: () => ({}),
        top: 100,
        width: 500,
        x: 0,
        y: 100,
      }) as DOMRect;
    viewport.scrollTo = mock(() => {}) as typeof viewport.scrollTo;

    const mockElement = document.createElement("div");
    mockElement.setAttribute(
      "data-article-key",
      "1_https://example.com/article",
    );
    mockElement.getBoundingClientRect = () =>
      ({
        bottom: 260,
        height: 80,
        left: 0,
        right: 500,
        toJSON: () => ({}),
        top: 180,
        width: 500,
        x: 0,
        y: 180,
      }) as DOMRect;
    mockElement.closest = mock(() => viewport) as typeof mockElement.closest;

    viewport.appendChild(mockElement);
    document.body.appendChild(viewport);

    const article = createMockArticle({
      id: 1,
      link: "https://example.com/article",
    });
    const articleKey = "1_https://example.com/article";
    const setFeed = mock(() => {});
    const setExpandedArticleKey = mock(() => {});

    const { result } = renderHook(() =>
      useArticleActions({
        articleFilter: "all",
        expandedArticleKey: articleKey,
        feed: [article],
        setExpandedArticleKey,
        setFeed,
      }),
    );

    await runWithAct(async () => {
      await result.current.handleArticleToggle(article);
    });

    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(viewport.scrollTo).not.toHaveBeenCalled();

    document.body.removeChild(viewport);
  });

  test("auto-hydration runs once per expanded key even if feed updates", async () => {
    const article = createMockArticle({
      id: 1,
      link: "https://example.com/article",
    });

    (ArticleService.extractArticleContent as ReturnType<typeof mock>)
      .mockClear()
      .mockImplementation(async () => "");

    const setFeed = mock(() => {});
    const setExpandedArticleKey = mock(() => {});

    const { rerender } = renderHook(
      ({ expandedArticleKey, feed }) =>
        useArticleActions({
          articleFilter: "all",
          expandedArticleKey,
          feed,
          setExpandedArticleKey,
          setFeed,
        }),
      {
        initialProps: {
          expandedArticleKey: article.link,
          feed: [article],
        },
      },
    );

    await waitFor(() => {
      expect(ArticleService.extractArticleContent).toHaveBeenCalledTimes(1);
    });

    rerender({
      expandedArticleKey: article.link,
      feed: [{ ...article, content: "new feed content snapshot" }],
    });

    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(ArticleService.extractArticleContent).toHaveBeenCalledTimes(1);
  });

  test("manual expand does not trigger duplicate extract on failure", async () => {
    const article = createMockArticle({
      id: 99,
      link: "https://example.com/fail-once",
    });

    (ArticleService.extractArticleContent as ReturnType<typeof mock>)
      .mockClear()
      .mockImplementation(async () => {
        throw new Error("blocked");
      });

    let expandedArticleKey: null | string = null;
    const setFeed = mock(() => {});
    const setExpandedArticleKey = mock((updater: any) => {
      expandedArticleKey =
        typeof updater === "function" ? updater(expandedArticleKey) : updater;
    });

    const { rerender, result } = renderHook(
      ({ expandedKey }) =>
        useArticleActions({
          articleFilter: "all",
          expandedArticleKey: expandedKey,
          feed: [article],
          setExpandedArticleKey,
          setFeed,
        }),
      { initialProps: { expandedKey: expandedArticleKey } },
    );

    await runWithAct(async () => {
      await result.current.handleArticleToggle(article);
    });

    rerender({ expandedKey: expandedArticleKey });
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(ArticleService.extractArticleContent).toHaveBeenCalledTimes(1);
  });

  test("changing distill strategy re-extracts the expanded article", async () => {
    const article = createMockArticle({
      id: 77,
      link: "https://example.com/strategy-refresh",
    });

    let expandedArticleKey: null | string = null;
    const setFeed = mock(() => {});
    const setExpandedArticleKey = mock((updater: unknown) => {
      expandedArticleKey =
        typeof updater === "function"
          ? updater(expandedArticleKey)
          : (updater ?? null);
    });

    const { rerender, result } = renderHook(
      ({ expandedKey, strategy }) =>
        useArticleActions({
          articleFilter: "all",
          distillStrategy: strategy,
          expandedArticleKey: expandedKey,
          feed: [article],
          setExpandedArticleKey,
          setFeed,
        }),
      {
        initialProps: {
          expandedKey: expandedArticleKey,
          strategy: "custom",
        },
      },
    );

    await runWithAct(async () => {
      await result.current.handleArticleToggle(article);
    });
    rerender({ expandedKey: expandedArticleKey, strategy: "custom" });

    await waitFor(() => {
      expect(
        (ArticleService.extractArticleContent as ReturnType<typeof mock>).mock
          .calls.length,
      ).toBeGreaterThan(0);
    });
    const initialExtractCallCount = (
      ArticleService.extractArticleContent as ReturnType<typeof mock>
    ).mock.calls.length;
    expect(ArticleService.extractArticleContent).toHaveBeenLastCalledWith(
      article.link,
      expect.objectContaining({
        distillStrategy: "custom",
        useProxy: undefined,
      }),
    );

    rerender({ expandedKey: expandedArticleKey, strategy: "readability" });

    await waitFor(() => {
      expect(ArticleService.extractArticleContent).toHaveBeenCalledTimes(
        initialExtractCallCount + 1,
      );
    });
    expect(ArticleService.extractArticleContent).toHaveBeenLastCalledWith(
      article.link,
      expect.objectContaining({
        distillStrategy: "readability",
        useProxy: undefined,
      }),
    );
  });
});
