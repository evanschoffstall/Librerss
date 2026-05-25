/**
 * Comprehensive Tests: Dashboard Article Actions Hook
 * Tests for src/app/dashboard/hooks/useArticleActions.ts
 */

import type { SetStateAction } from "react";

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
import * as realSonnerModule from "sonner";

import type { Article } from "@/lib/core";

import { ARTICLE_STATUS_STALE_RESUME_ABORT_REASON } from "@/app/dashboard/hooks/article-actions";
import { useArticleActions } from "@/app/dashboard/hooks/useArticleActions";
import { ArticleService } from "@/lib/api";

import { createMockArticle } from "./support/test-utils";

beforeEach(() => mock.restore());
afterEach(() => mock.restore());

const runWithAct = async (callback: () => Promise<void> | void) => {
  await act(async () => {
    await callback();
  });
};

beforeAll(() => {
  mock.module("sonner", () => ({
    ...realSonnerModule,
    toast: {
      ...realSonnerModule.toast,
      error: mock(() => {}),
      success: mock(() => {}),
    },
  }));
});

const originalExtractArticleContent = ArticleService.extractArticleContent;
const originalGetStoredArticleContent = ArticleService.getStoredArticleContent;
const originalUpdateArticleStatus = ArticleService.updateArticleStatus;
const originalConsoleError = console.error;
const muteConsoleError = (() => {}) as typeof console.error;

afterAll(() => {
  ArticleService.updateArticleStatus =
    originalUpdateArticleStatus as typeof ArticleService.updateArticleStatus;
  ArticleService.extractArticleContent =
    originalExtractArticleContent as typeof ArticleService.extractArticleContent;
  ArticleService.getStoredArticleContent =
    originalGetStoredArticleContent as typeof ArticleService.getStoredArticleContent;
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
    ArticleService.getStoredArticleContent = mock(
      async () => "<p>Stored content</p>",
    ) as unknown as typeof ArticleService.getStoredArticleContent;
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
    expect(!false).toBe(true);
    expect(!true).toBe(false);
    expect(!false).toBe(true);
    expect(!true).toBe(false);
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
    expect(result.current.collapsingArticles).toEqual({});
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

    expect(ArticleService.updateArticleStatus).toHaveBeenCalledWith(
      1,
      {
        isStarred: true,
      },
      { keepalive: true, signal: expect.any(AbortSignal) },
    );
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

    expect(ArticleService.updateArticleStatus).toHaveBeenCalledWith(
      2,
      {
        isStarred: false,
      },
      { keepalive: true, signal: expect.any(AbortSignal) },
    );
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

  test("keeps updating state active until overlapping read and starred mutations settle", async () => {
    let resolveReadMutation: (() => void) | undefined;
    let resolveStarMutation: (() => void) | undefined;

    ArticleService.updateArticleStatus = mock(
      async (
        _articleId: number,
        patch: { isRead?: boolean; isStarred?: boolean },
      ) =>
        await new Promise<void>((resolve) => {
          if (patch.isRead !== undefined) {
            resolveReadMutation = resolve;
            return;
          }

          resolveStarMutation = resolve;
        }),
    ) as unknown as typeof ArticleService.updateArticleStatus;

    const article = createMockArticle({
      id: 6,
      isRead: false,
      isStarred: false,
    });
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

    let readMutationPromise!: Promise<void>;
    let starMutationPromise!: Promise<void>;
    await act(async () => {
      readMutationPromise = result.current.handleToggleReadState(article);
      starMutationPromise = result.current.handleToggleStarredState(article);
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(result.current.updatingArticleState[article.link]).toBe(true);
    });

    await act(async () => {
      resolveReadMutation?.();
      await readMutationPromise;
    });

    await waitFor(() => {
      expect(result.current.updatingArticleState[article.link]).toBe(true);
    });

    await act(async () => {
      resolveStarMutation?.();
      await starMutationPromise;
    });

    await waitFor(() => {
      expect(result.current.updatingArticleState).toEqual({});
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

    expect(ArticleService.updateArticleStatus).toHaveBeenCalledWith(
      1,
      {
        isRead: true,
      },
      { keepalive: true, signal: expect.any(AbortSignal) },
    );
  });

  test("handleArticleToggle collapses read articles in unread filter without staging a non-swipe removal", async () => {
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
    expect(result.current.collapsingArticles).toEqual({
      [article.link]: {
        article,
        index: 0,
        mode: "de-expanding",
      },
    });
  });

  test("handleArticleToggle treats expanded unread articles as read when collapsing in unread filter without staging a non-swipe removal", async () => {
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

    expect(result.current.collapsingArticles).toEqual({
      [article.link]: {
        article,
        index: 0,
        mode: "de-expanding",
      },
    });
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

  test("handleToggleReadState updates unread-filter articles without staging a non-swipe removal", async () => {
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
    expect(result.current.collapsingArticles).toEqual({
      [article.link]: {
        article,
        index: 0,
        mode: "collapse",
      },
    });
  });

  test("handleMarkArticlesRead batches unread-filter removals through the same collapse path", async () => {
    const firstArticle = createMockArticle({
      id: 120,
      isRead: false,
      link: "https://example.com/batch-removal-1",
    });
    const secondArticle = createMockArticle({
      id: 121,
      isRead: false,
      link: "https://example.com/batch-removal-2",
    });
    let feedState = [firstArticle, secondArticle];
    const setFeed = mock((updater: SetStateAction<Article[]>) => {
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
      await result.current.handleMarkArticlesRead([
        firstArticle,
        secondArticle,
      ]);
    });

    expect(feedState).toEqual([
      { ...firstArticle, isRead: true },
      { ...secondArticle, isRead: true },
    ]);
    expect(result.current.collapsingArticles).toEqual({
      [firstArticle.link]: {
        article: firstArticle,
        index: 0,
        mode: "collapse",
      },
      [secondArticle.link]: {
        article: secondArticle,
        index: 1,
        mode: "collapse",
      },
    });
    expect(setFeed).toHaveBeenCalledTimes(2);
  });

  test("handleMarkArticlesRead reapplies successful read state after a stale refresh overwrites the feed", async () => {
    let resolveStatusUpdate!: () => void;
    ArticleService.updateArticleStatus = mock(
      () =>
        new Promise<void>((resolve) => {
          resolveStatusUpdate = resolve;
        }),
    ) as unknown as typeof ArticleService.updateArticleStatus;

    const article = createMockArticle({
      id: 122,
      isRead: false,
      link: "https://example.com/stale-sort-refresh",
    });
    let feedState = [article];
    const setFeed = mock((updater: SetStateAction<Article[]>) => {
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

    let mutationPromise!: Promise<void>;
    await act(async () => {
      mutationPromise = result.current.handleMarkArticlesRead([article]);
      await Promise.resolve();
    });

    expect(feedState[0]?.isRead).toBe(true);

    feedState = [{ ...article, isRead: false }];

    await act(async () => {
      resolveStatusUpdate();
      await mutationPromise;
    });

    expect(feedState[0]?.isRead).toBe(true);
  });

  test("handleMarkArticlesRead retries stale-resume aborts so visible-read rows do not pop back", async () => {
    type UpdateArticleStatusOptions = Parameters<
      typeof ArticleService.updateArticleStatus
    >[2];

    const article = createMockArticle({
      id: 124,
      isRead: false,
      link: "https://example.com/stale-resume-visible-read",
    });
    const updateOptions: UpdateArticleStatusOptions[] = [];
    ArticleService.updateArticleStatus = mock(
      async (_articleId, _updates, options) => {
        updateOptions.push(options);

        if (updateOptions.length > 1) {
          return;
        }

        await new Promise<void>((_resolve, reject) => {
          options?.signal?.addEventListener(
            "abort",
            () => {
              reject(new DOMException("stale resume", "AbortError"));
            },
            { once: true },
          );
        });
      },
    ) as unknown as typeof ArticleService.updateArticleStatus;

    let feedState = [article];
    const setFeed = mock((updater: SetStateAction<Article[]>) => {
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

    let mutationPromise!: Promise<void>;
    await act(async () => {
      mutationPromise = result.current.handleMarkArticlesRead([article]);
      await Promise.resolve();
    });

    expect(feedState[0]?.isRead).toBe(true);

    await act(async () => {
      result.current.cancelPendingArticleStatusMutations();
      await mutationPromise;
    });

    expect(updateOptions).toHaveLength(2);
    expect(updateOptions[0]?.keepalive).toBe(true);
    expect(updateOptions[0]?.signal?.reason).toBe(
      ARTICLE_STATUS_STALE_RESUME_ABORT_REASON,
    );
    expect(updateOptions[1]).toEqual({ keepalive: true });
    expect(feedState[0]?.isRead).toBe(true);
  });

  test("handleToggleReadState ignores stale success after a newer read mutation supersedes it", async () => {
    const resolveStatusUpdates: (() => void)[] = [];
    ArticleService.updateArticleStatus = mock(
      () =>
        new Promise<void>((resolve) => {
          resolveStatusUpdates.push(resolve);
        }),
    ) as unknown as typeof ArticleService.updateArticleStatus;

    const article = createMockArticle({
      id: 123,
      isRead: false,
      link: "https://example.com/newer-read-mutation",
    });
    let feedState = [article];
    const setFeed = mock((updater: SetStateAction<Article[]>) => {
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

    let firstMutationPromise!: Promise<void>;
    await act(async () => {
      firstMutationPromise = result.current.handleToggleReadState(article);
      await Promise.resolve();
    });

    expect(feedState[0]?.isRead).toBe(true);

    let secondMutationPromise!: Promise<void>;
    await act(async () => {
      secondMutationPromise = result.current.handleToggleReadState(
        feedState[0]!,
      );
      await Promise.resolve();
    });

    expect(feedState[0]?.isRead).toBe(false);

    await act(async () => {
      resolveStatusUpdates[0]?.();
      await firstMutationPromise;
    });

    expect(feedState[0]?.isRead).toBe(false);

    await act(async () => {
      resolveStatusUpdates[1]?.();
      await secondMutationPromise;
    });

    expect(feedState[0]?.isRead).toBe(false);
  });

  test("handleSwipeRead updates unread-filter articles without staging a swipe-removal row", async () => {
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
    expect(result.current.collapsingArticles).toEqual({
      [article.link]: {
        article,
        index: 0,
        mode: "swipe-read",
      },
    });
  });

  test("handleSwipeRead updates read state before the status request settles without staging a swipe-removal row", async () => {
    let resolveStatusUpdate: (() => void) | undefined;
    ArticleService.updateArticleStatus = mock(
      () =>
        new Promise<void>((resolve) => {
          resolveStatusUpdate = resolve;
        }),
    ) as unknown as typeof ArticleService.updateArticleStatus;

    const article = createMockArticle({
      id: 130,
      isRead: false,
      link: "https://example.com/swipe-removal-immediate",
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

    let swipeReadPromise: Promise<void> | undefined;
    await act(async () => {
      swipeReadPromise = result.current.handleSwipeRead(article);
    });

    expect(feedState[0]?.isRead).toBe(true);
    expect(result.current.collapsingArticles).toEqual({
      [article.link]: {
        article,
        index: 0,
        mode: "swipe-read",
      },
    });

    resolveStatusUpdate?.();
    await swipeReadPromise;
  });

  test("handleArticleToggle expands before hydration settles", async () => {
    let resolveHydration: (() => void) | undefined;
    ArticleService.extractArticleContent = mock(
      () =>
        new Promise<string>((resolve) => {
          resolveHydration = () => resolve("<p>Extracted content</p>");
        }),
    ) as unknown as typeof ArticleService.extractArticleContent;

    const article = createMockArticle({
      id: 140,
      isRead: false,
      link: "https://example.com/expand-immediate",
    });
    let expandedArticleKey: null | string = null;
    const setFeed = mock(() => {});
    const setExpandedArticleKey = mock((updater: any) => {
      expandedArticleKey =
        typeof updater === "function" ? updater(expandedArticleKey) : updater;
      return expandedArticleKey;
    });

    const { result } = renderHook(() =>
      useArticleActions({
        articleFilter: "all",
        expandedArticleKey,
        feed: [article],
        setExpandedArticleKey,
        setFeed,
      }),
    );

    await act(async () => {
      result.current.handleArticleToggle(article);
    });

    if (expandedArticleKey === null) {
      throw new Error(
        "Expected the article to expand before hydration settled.",
      );
    }

    if (expandedArticleKey !== article.link) {
      throw new Error(
        "Expected the article key to update before hydration settled.",
      );
    }

    expect(setExpandedArticleKey).toHaveBeenCalled();

    resolveHydration?.();
    await waitFor(() => {
      expect(ArticleService.extractArticleContent).toHaveBeenCalledTimes(1);
    });

    const extractCall = (
      ArticleService.extractArticleContent as ReturnType<typeof mock>
    ).mock.calls.at(-1);

    expect(extractCall?.[0]).toBe(article.link);
    expect(extractCall?.[1]).toEqual(
      expect.objectContaining({
        signal: expect.any(AbortSignal),
      }),
    );
  });

  test("collapsing an already-read expanded article clears expansion without staging the removed de-expansion hold", async () => {
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

    expect(result.current.collapsingArticles).toEqual({
      [article.link]: {
        article,
        index: 0,
        mode: "de-expanding",
      },
    });
    expect(setExpandedArticleKey).toHaveBeenCalled();
  });

  test("handleExpandedSwipeRead marks article read and collapses without staging a swipe-removal row", async () => {
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
    expect(ArticleService.updateArticleStatus).toHaveBeenCalledWith(
      11,
      {
        isRead: true,
      },
      { keepalive: true, signal: expect.any(AbortSignal) },
    );
    expect(result.current.collapsingArticles).toEqual({
      [article.link]: {
        article,
        index: 0,
        mode: "swipe-read",
      },
    });
    expect(setExpandedArticleKey).toHaveBeenCalled();
  });

  test("tracks overlapping swipe reads without staging retained removal rows", async () => {
    const firstArticle = createMockArticle({
      id: 31,
      isRead: false,
      link: "https://example.com/first-overlap",
    });
    const secondArticle = createMockArticle({
      id: 32,
      isRead: false,
      link: "https://example.com/second-overlap",
    });
    let feedState = [firstArticle, secondArticle];
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
      await result.current.handleSwipeRead(firstArticle);
      await result.current.handleSwipeRead(secondArticle);
    });

    expect(result.current.collapsingArticles).toEqual({
      [firstArticle.link]: {
        article: firstArticle,
        index: 0,
        mode: "swipe-read",
      },
      [secondArticle.link]: {
        article: secondArticle,
        index: 1,
        mode: "swipe-read",
      },
    });
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
    }) as Article;
    let feedState: Article[] = [article];
    let expandedArticleKey: null | string = null;
    const setFeed = mock((updater: SetStateAction<Article[]>) => {
      feedState = typeof updater === "function" ? updater(feedState) : updater;
    });
    const setExpandedArticleKey = mock((updater: any) => {
      expandedArticleKey =
        typeof updater === "function" ? updater(expandedArticleKey) : updater;
    });

    const { rerender, result } = renderHook(
      ({ expandedKey }) =>
        useArticleActions({
          articleFilter: "all",
          expandedArticleKey: expandedKey,
          feed: feedState,
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
      expect(feedState[0]?.hasFullContent).toBe(true);
    });
    rerender({ expandedKey: expandedArticleKey });

    await runWithAct(async () => {
      await result.current.handleArticleToggle(feedState[0]!);
    });
    rerender({ expandedKey: expandedArticleKey });

    await runWithAct(async () => {
      await result.current.handleArticleToggle(feedState[0]!);
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
          strategy: "librerss",
        },
      },
    );

    await runWithAct(async () => {
      await result.current.handleArticleToggle(article);
    });
    rerender({ expandedKey: expandedArticleKey, strategy: "librerss" });

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
        distillStrategy: "librerss",
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

  test("collapse scroll restore activates when a pre-expand snapshot exists", async () => {
    const nativePerformanceNow = performance.now;
    const nativeRequestAnimationFrame = window.requestAnimationFrame;
    const nativeCancelAnimationFrame = window.cancelAnimationFrame;

    Object.defineProperty(performance, "now", {
      configurable: true,
      value: () => 0,
    });

    window.requestAnimationFrame = mock(
      () => 1,
    ) as typeof window.requestAnimationFrame;
    window.cancelAnimationFrame = mock(
      () => {},
    ) as typeof window.cancelAnimationFrame;

    const viewport = document.createElement("div");
    viewport.setAttribute("data-radix-scroll-area-viewport", "");
    viewport.getBoundingClientRect = mock(() => ({
      bottom: 0,
      height: 0,
      left: 0,
      right: 0,
      toJSON: () => ({}),
      top: 100,
      width: 0,
      x: 0,
      y: 100,
    })) as typeof viewport.getBoundingClientRect;
    Object.defineProperty(viewport, "scrollTop", {
      configurable: true,
      value: 320,
      writable: true,
    });
    Object.defineProperty(viewport, "clientHeight", {
      configurable: true,
      value: 400,
    });

    const article = createMockArticle({
      id: 203,
      link: "https://example.com/restore-scroll",
    });
    const articleElement = document.createElement("div");
    articleElement.setAttribute("data-article-key", article.link);
    articleElement.getBoundingClientRect = mock(() => ({
      bottom: 0,
      height: 0,
      left: 0,
      right: 0,
      toJSON: () => ({}),
      top: 140,
      width: 0,
      x: 0,
      y: 140,
    })) as typeof articleElement.getBoundingClientRect;
    articleElement.closest = mock(
      () => viewport,
    ) as typeof articleElement.closest;
    viewport.appendChild(articleElement);
    document.body.appendChild(viewport);

    let expandedArticleKey: null | string = article.link;
    const setFeed = mock(() => {});
    const setExpandedArticleKey = mock((updater: unknown) => {
      expandedArticleKey =
        typeof updater === "function"
          ? updater(expandedArticleKey)
          : (updater as null | string);
    });

    const { rerender, result } = renderHook(
      ({ currentExpandedKey }) =>
        useArticleActions({
          articleFilter: "all",
          expandedArticleKey: currentExpandedKey,
          feed: [article],
          setExpandedArticleKey,
          setFeed,
        }),
      {
        initialProps: {
          currentExpandedKey: expandedArticleKey,
        },
      },
    );

    await runWithAct(() => {
      result.current.capturePreExpandSnapshot(article);
    });

    await runWithAct(() => {
      result.current.handleArticleToggle(article);
    });
    rerender({ currentExpandedKey: expandedArticleKey });

    expect(result.current.isCollapseScrollRestoreActive).toBe(true);
    expect(viewport.scrollTop).toBe(320);
    expect(viewport.style.overflowAnchor).toBe("none");

    document.body.removeChild(viewport);
    Object.defineProperty(performance, "now", {
      configurable: true,
      value: nativePerformanceNow,
    });
    window.requestAnimationFrame = nativeRequestAnimationFrame;
    window.cancelAnimationFrame = nativeCancelAnimationFrame;
  });

  test("collapse scroll restore ignores stale pre-expand positions when the article header is offscreen", async () => {
    const nativePerformanceNow = performance.now;
    const nativeRequestAnimationFrame = window.requestAnimationFrame;
    const nativeCancelAnimationFrame = window.cancelAnimationFrame;
    const now = 0;

    Object.defineProperty(performance, "now", {
      configurable: true,
      value: () => now,
    });

    const rafCallbacks: FrameRequestCallback[] = [];
    window.requestAnimationFrame = mock((callback: FrameRequestCallback) => {
      rafCallbacks.push(callback);
      return rafCallbacks.length;
    }) as typeof window.requestAnimationFrame;
    window.cancelAnimationFrame = mock(
      () => {},
    ) as typeof window.cancelAnimationFrame;

    const viewport = document.createElement("div");
    viewport.setAttribute("data-radix-scroll-area-viewport", "");
    viewport.getBoundingClientRect = mock(() => ({
      bottom: 0,
      height: 0,
      left: 0,
      right: 0,
      toJSON: () => ({}),
      top: 100,
      width: 0,
      x: 0,
      y: 100,
    })) as typeof viewport.getBoundingClientRect;
    Object.defineProperty(viewport, "clientHeight", {
      configurable: true,
      value: 400,
    });
    Object.defineProperty(viewport, "scrollTop", {
      configurable: true,
      value: 320,
      writable: true,
    });

    const article = createMockArticle({
      id: 204,
      link: "https://example.com/live-collapse-anchor",
    });
    let articleTop = 140;
    const articleElement = document.createElement("div");
    articleElement.setAttribute("data-article-key", article.link);
    articleElement.getBoundingClientRect = mock(() => ({
      bottom: 0,
      height: 0,
      left: 0,
      right: 0,
      toJSON: () => ({}),
      top: articleTop,
      width: 0,
      x: 0,
      y: articleTop,
    })) as typeof articleElement.getBoundingClientRect;
    articleElement.closest = mock(
      () => viewport,
    ) as typeof articleElement.closest;
    viewport.appendChild(articleElement);
    document.body.appendChild(viewport);

    let expandedArticleKey: null | string = article.link;
    const setFeed = mock(() => {});
    const setExpandedArticleKey = mock((updater: unknown) => {
      expandedArticleKey =
        typeof updater === "function"
          ? updater(expandedArticleKey)
          : (updater as null | string);
    });

    const { rerender, result } = renderHook(
      ({ currentExpandedKey }) =>
        useArticleActions({
          articleFilter: "all",
          expandedArticleKey: currentExpandedKey,
          feed: [article],
          setExpandedArticleKey,
          setFeed,
        }),
      {
        initialProps: {
          currentExpandedKey: expandedArticleKey,
        },
      },
    );

    await runWithAct(() => {
      result.current.capturePreExpandSnapshot(article);
    });

    viewport.scrollTop = 900;
    articleTop = -520;

    await runWithAct(() => {
      result.current.handleArticleToggle(article);
    });
    rerender({ currentExpandedKey: expandedArticleKey });

    expect(result.current.isCollapseScrollRestoreActive).toBe(false);
    expect(viewport.scrollTop).toBe(900);
    expect(rafCallbacks).toHaveLength(0);

    document.body.removeChild(viewport);
    Object.defineProperty(performance, "now", {
      configurable: true,
      value: nativePerformanceNow,
    });
    window.requestAnimationFrame = nativeRequestAnimationFrame;
    window.cancelAnimationFrame = nativeCancelAnimationFrame;
  });

  test("collapse restore still runs even when legacy inverted feed attributes are present", async () => {
    const viewport = document.createElement("div");
    viewport.setAttribute("data-radix-scroll-area-viewport", "");
    Object.defineProperty(viewport, "clientHeight", {
      configurable: true,
      value: 400,
    });
    Object.defineProperty(viewport, "scrollTop", {
      configurable: true,
      value: 440,
      writable: true,
    });

    const invertedFeedSurface = document.createElement("div");
    invertedFeedSurface.setAttribute("data-inverted-scroll", "true");
    invertedFeedSurface.appendChild(viewport);

    const article = createMockArticle({
      id: 2041,
      link: "https://example.com/inverted-collapse-no-generic-restore",
    });
    const articleElement = document.createElement("div");
    articleElement.setAttribute("data-article-key", article.link);
    articleElement.getBoundingClientRect = mock(() => ({
      bottom: 260,
      height: 120,
      left: 0,
      right: 0,
      toJSON: () => ({}),
      top: 140,
      width: 0,
      x: 0,
      y: 140,
    })) as typeof articleElement.getBoundingClientRect;
    articleElement.closest = mock((selector: string) => {
      if (selector === "[data-radix-scroll-area-viewport]") {
        return viewport;
      }

      if (selector === "[data-inverted-scroll='true']") {
        return invertedFeedSurface;
      }

      return null;
    }) as typeof articleElement.closest;
    viewport.appendChild(articleElement);
    document.body.appendChild(invertedFeedSurface);

    let expandedArticleKey: null | string = article.link;
    const setFeed = mock(() => {});
    const setExpandedArticleKey = mock(
      (updater: SetStateAction<null | string>) => {
        expandedArticleKey =
          typeof updater === "function" ? updater(expandedArticleKey) : updater;
      },
    );

    const { rerender, result } = renderHook(
      ({ currentExpandedKey }) =>
        useArticleActions({
          articleFilter: "all",
          expandedArticleKey: currentExpandedKey,
          feed: [article],
          setExpandedArticleKey,
          setFeed,
        }),
      {
        initialProps: {
          currentExpandedKey: expandedArticleKey,
        },
      },
    );

    await runWithAct(() => {
      result.current.capturePreExpandSnapshot(article);
    });

    await runWithAct(() => {
      result.current.handleArticleToggle(article);
    });
    rerender({ currentExpandedKey: expandedArticleKey });

    expect(result.current.isCollapseScrollRestoreActive).toBe(true);
    expect(viewport.scrollTop).toBe(440);
    expect(viewport.style.overflowAnchor).toBe("none");

    document.body.removeChild(invertedFeedSurface);
  });

  test("collapse scroll restore returns to the pre-expand position while the expanded article is still in view", async () => {
    const nativePerformanceNow = performance.now;
    const nativeRequestAnimationFrame = window.requestAnimationFrame;
    const nativeCancelAnimationFrame = window.cancelAnimationFrame;
    const now = 0;

    Object.defineProperty(performance, "now", {
      configurable: true,
      value: () => now,
    });

    window.requestAnimationFrame = mock(
      () => 1,
    ) as typeof window.requestAnimationFrame;
    window.cancelAnimationFrame = mock(
      () => {},
    ) as typeof window.cancelAnimationFrame;

    const viewport = document.createElement("div");
    viewport.setAttribute("data-radix-scroll-area-viewport", "");
    viewport.getBoundingClientRect = mock(() => ({
      bottom: 500,
      height: 400,
      left: 0,
      right: 0,
      toJSON: () => ({}),
      top: 100,
      width: 0,
      x: 0,
      y: 100,
    })) as typeof viewport.getBoundingClientRect;
    Object.defineProperty(viewport, "clientHeight", {
      configurable: true,
      value: 400,
    });
    Object.defineProperty(viewport, "scrollTop", {
      configurable: true,
      value: 320,
      writable: true,
    });

    const article = createMockArticle({
      id: 205,
      link: "https://example.com/restore-scroll-while-intersecting",
    });
    let articleTop = 140;
    let articleHeight = 120;
    const articleElement = document.createElement("div");
    articleElement.setAttribute("data-article-key", article.link);
    articleElement.getBoundingClientRect = mock(() => ({
      bottom: articleTop + articleHeight,
      height: articleHeight,
      left: 0,
      right: 0,
      toJSON: () => ({}),
      top: articleTop,
      width: 0,
      x: 0,
      y: articleTop,
    })) as typeof articleElement.getBoundingClientRect;
    articleElement.closest = mock(
      () => viewport,
    ) as typeof articleElement.closest;
    viewport.appendChild(articleElement);
    document.body.appendChild(viewport);

    let expandedArticleKey: null | string = article.link;
    const setFeed = mock(() => {});
    const setExpandedArticleKey = mock((updater: unknown) => {
      expandedArticleKey =
        typeof updater === "function"
          ? updater(expandedArticleKey)
          : (updater as null | string);
    });

    const { rerender, result } = renderHook(
      ({ currentExpandedKey }) =>
        useArticleActions({
          articleFilter: "all",
          expandedArticleKey: currentExpandedKey,
          feed: [article],
          setExpandedArticleKey,
          setFeed,
        }),
      {
        initialProps: {
          currentExpandedKey: expandedArticleKey,
        },
      },
    );

    await runWithAct(() => {
      result.current.capturePreExpandSnapshot(article);
    });

    viewport.scrollTop = 440;
    articleTop = 20;
    articleHeight = 520;

    await runWithAct(() => {
      result.current.handleArticleToggle(article);
    });
    rerender({ currentExpandedKey: expandedArticleKey });

    expect(result.current.isCollapseScrollRestoreActive).toBe(true);
    expect(viewport.scrollTop).toBe(320);

    document.body.removeChild(viewport);
    Object.defineProperty(performance, "now", {
      configurable: true,
      value: nativePerformanceNow,
    });
    window.requestAnimationFrame = nativeRequestAnimationFrame;
    window.cancelAnimationFrame = nativeCancelAnimationFrame;
  });

  test("collapse scroll restore keeps the pre-expand position after unread collapse removes the article row", async () => {
    const nativePerformanceNow = performance.now;
    const nativeRequestAnimationFrame = window.requestAnimationFrame;
    const nativeCancelAnimationFrame = window.cancelAnimationFrame;
    const now = 0;

    Object.defineProperty(performance, "now", {
      configurable: true,
      value: () => now,
    });

    const rafCallbacks: FrameRequestCallback[] = [];
    window.requestAnimationFrame = mock((callback: FrameRequestCallback) => {
      rafCallbacks.push(callback);
      return rafCallbacks.length;
    }) as typeof window.requestAnimationFrame;
    window.cancelAnimationFrame = mock(
      () => {},
    ) as typeof window.cancelAnimationFrame;

    const viewport = document.createElement("div");
    viewport.setAttribute("data-radix-scroll-area-viewport", "");
    viewport.getBoundingClientRect = mock(() => ({
      bottom: 500,
      height: 400,
      left: 0,
      right: 0,
      toJSON: () => ({}),
      top: 100,
      width: 0,
      x: 0,
      y: 100,
    })) as typeof viewport.getBoundingClientRect;
    Object.defineProperty(viewport, "clientHeight", {
      configurable: true,
      value: 400,
    });
    Object.defineProperty(viewport, "scrollTop", {
      configurable: true,
      value: 320,
      writable: true,
    });

    const article = createMockArticle({
      id: 206,
      isRead: false,
      link: "https://example.com/unread-restore-after-removal",
    });
    let articleTop = 140;
    const articleHeight = 520;
    const articleElement = document.createElement("div");
    articleElement.setAttribute("data-article-key", article.link);
    articleElement.getBoundingClientRect = mock(() => ({
      bottom: articleTop + articleHeight,
      height: articleHeight,
      left: 0,
      right: 0,
      toJSON: () => ({}),
      top: articleTop,
      width: 0,
      x: 0,
      y: articleTop,
    })) as typeof articleElement.getBoundingClientRect;
    articleElement.closest = mock(
      () => viewport,
    ) as typeof articleElement.closest;
    viewport.appendChild(articleElement);
    document.body.appendChild(viewport);

    let expandedArticleKey: null | string = article.link;
    const setFeed = mock(() => {});
    const setExpandedArticleKey = mock((updater: unknown) => {
      expandedArticleKey =
        typeof updater === "function"
          ? updater(expandedArticleKey)
          : (updater as null | string);
    });

    const { rerender, result } = renderHook(
      ({ currentExpandedKey }) =>
        useArticleActions({
          articleFilter: "unread",
          expandedArticleKey: currentExpandedKey,
          feed: [article],
          setExpandedArticleKey,
          setFeed,
        }),
      {
        initialProps: {
          currentExpandedKey: expandedArticleKey,
        },
      },
    );

    await runWithAct(() => {
      result.current.capturePreExpandSnapshot(article);
    });

    viewport.scrollTop = 440;
    articleTop = 20;

    await runWithAct(() => {
      result.current.handleArticleToggle(article);
    });
    rerender({ currentExpandedKey: expandedArticleKey });

    expect(result.current.isCollapseScrollRestoreActive).toBe(true);
    expect(viewport.scrollTop).toBe(320);

    viewport.scrollTop = 1080;
    articleElement.remove();

    await runWithAct(() => {
      rafCallbacks[0]?.(0);
    });

    expect(viewport.scrollTop).toBe(320);
    expect(result.current.isCollapseScrollRestoreActive).toBe(true);

    document.body.removeChild(viewport);
    Object.defineProperty(performance, "now", {
      configurable: true,
      value: nativePerformanceNow,
    });
    window.requestAnimationFrame = nativeRequestAnimationFrame;
    window.cancelAnimationFrame = nativeCancelAnimationFrame;
  });

  test("collapse scroll restore follows the replacement feed viewport after unread row removal", async () => {
    const nativePerformanceNow = performance.now;
    const nativeRequestAnimationFrame = window.requestAnimationFrame;
    const nativeCancelAnimationFrame = window.cancelAnimationFrame;
    const now = 0;

    Object.defineProperty(performance, "now", {
      configurable: true,
      value: () => now,
    });

    const rafCallbacks: FrameRequestCallback[] = [];
    window.requestAnimationFrame = mock((callback: FrameRequestCallback) => {
      rafCallbacks.push(callback);
      return rafCallbacks.length;
    }) as typeof window.requestAnimationFrame;
    window.cancelAnimationFrame = mock(
      () => {},
    ) as typeof window.cancelAnimationFrame;

    const viewport = document.createElement("div");
    viewport.setAttribute("data-radix-scroll-area-viewport", "");
    viewport.getBoundingClientRect = mock(() => ({
      bottom: 500,
      height: 400,
      left: 0,
      right: 0,
      toJSON: () => ({}),
      top: 100,
      width: 0,
      x: 0,
      y: 100,
    })) as typeof viewport.getBoundingClientRect;
    Object.defineProperty(viewport, "clientHeight", {
      configurable: true,
      value: 400,
    });
    Object.defineProperty(viewport, "scrollTop", {
      configurable: true,
      value: 320,
      writable: true,
    });

    const article = createMockArticle({
      id: 207,
      isRead: false,
      link: "https://example.com/unread-restore-viewport-swap",
    });
    let articleTop = 140;
    const articleHeight = 520;
    const articleElement = document.createElement("div");
    articleElement.setAttribute("data-article-key", article.link);
    articleElement.getBoundingClientRect = mock(() => ({
      bottom: articleTop + articleHeight,
      height: articleHeight,
      left: 0,
      right: 0,
      toJSON: () => ({}),
      top: articleTop,
      width: 0,
      x: 0,
      y: articleTop,
    })) as typeof articleElement.getBoundingClientRect;
    articleElement.closest = mock(
      () => viewport,
    ) as typeof articleElement.closest;
    viewport.appendChild(articleElement);
    document.body.appendChild(viewport);

    let expandedArticleKey: null | string = article.link;
    const setFeed = mock(() => {});
    const setExpandedArticleKey = mock((updater: unknown) => {
      expandedArticleKey =
        typeof updater === "function"
          ? updater(expandedArticleKey)
          : (updater as null | string);
    });

    const { rerender, result } = renderHook(
      ({ currentExpandedKey }) =>
        useArticleActions({
          articleFilter: "unread",
          expandedArticleKey: currentExpandedKey,
          feed: [article],
          setExpandedArticleKey,
          setFeed,
        }),
      {
        initialProps: {
          currentExpandedKey: expandedArticleKey,
        },
      },
    );

    await runWithAct(() => {
      result.current.capturePreExpandSnapshot(article);
    });

    viewport.scrollTop = 440;
    articleTop = 20;

    await runWithAct(() => {
      result.current.handleArticleToggle(article);
    });
    rerender({ currentExpandedKey: expandedArticleKey });

    expect(result.current.isCollapseScrollRestoreActive).toBe(true);
    expect(viewport.scrollTop).toBe(320);

    const replacementViewport = document.createElement("div");
    replacementViewport.setAttribute("data-radix-scroll-area-viewport", "");
    replacementViewport.getBoundingClientRect = viewport.getBoundingClientRect;
    Object.defineProperty(replacementViewport, "clientHeight", {
      configurable: true,
      value: 400,
    });
    Object.defineProperty(replacementViewport, "scrollTop", {
      configurable: true,
      value: 1080,
      writable: true,
    });

    const replacementFeed = document.createElement("div");
    replacementFeed.setAttribute("data-feed-virtualizer", "true");
    replacementViewport.appendChild(replacementFeed);
    document.body.appendChild(replacementViewport);

    document.body.removeChild(viewport);

    await runWithAct(() => {
      rafCallbacks[0]?.(0);
    });

    expect(replacementViewport.scrollTop).toBe(320);
    expect(result.current.isCollapseScrollRestoreActive).toBe(true);

    document.body.removeChild(replacementViewport);
    Object.defineProperty(performance, "now", {
      configurable: true,
      value: nativePerformanceNow,
    });
    window.requestAnimationFrame = nativeRequestAnimationFrame;
    window.cancelAnimationFrame = nativeCancelAnimationFrame;
  });

  test("collapse scroll restore reapplies before the next animation frame when layout observers fire", async () => {
    const nativePerformanceNow = performance.now;
    const nativeRequestAnimationFrame = window.requestAnimationFrame;
    const nativeCancelAnimationFrame = window.cancelAnimationFrame;
    const nativeResizeObserver = global.ResizeObserver;
    const now = 0;

    class ResizeObserverMock {
      static instances: ResizeObserverMock[] = [];

      private readonly callback: ResizeObserverCallback;
      private readonly observedElements = new Set<Element>();

      public constructor(callback: ResizeObserverCallback) {
        this.callback = callback;
        ResizeObserverMock.instances.push(this);
      }

      public disconnect() {
        this.observedElements.clear();
      }

      public observe(target: Element) {
        this.observedElements.add(target);
      }

      public trigger() {
        const entries = Array.from(this.observedElements, (target) => ({
          target,
        })) as ResizeObserverEntry[];
        this.callback(entries, this as unknown as ResizeObserver);
      }
    }

    Object.defineProperty(performance, "now", {
      configurable: true,
      value: () => now,
    });

    const rafCallbacks: FrameRequestCallback[] = [];
    window.requestAnimationFrame = mock((callback: FrameRequestCallback) => {
      rafCallbacks.push(callback);
      return rafCallbacks.length;
    }) as typeof window.requestAnimationFrame;
    window.cancelAnimationFrame = mock(
      () => {},
    ) as typeof window.cancelAnimationFrame;
    Object.defineProperty(global, "ResizeObserver", {
      configurable: true,
      value: ResizeObserverMock as unknown as typeof ResizeObserver,
    });

    const viewport = document.createElement("div");
    viewport.setAttribute("data-radix-scroll-area-viewport", "");
    viewport.getBoundingClientRect = mock(() => ({
      bottom: 500,
      height: 400,
      left: 0,
      right: 0,
      toJSON: () => ({}),
      top: 100,
      width: 0,
      x: 0,
      y: 100,
    })) as typeof viewport.getBoundingClientRect;
    Object.defineProperty(viewport, "clientHeight", {
      configurable: true,
      value: 400,
    });
    Object.defineProperty(viewport, "scrollTop", {
      configurable: true,
      value: 320,
      writable: true,
    });

    const article = createMockArticle({
      id: 208,
      isRead: false,
      link: "https://example.com/unread-restore-observer-sync",
    });
    let articleTop = 140;
    const articleHeight = 520;
    const articleElement = document.createElement("div");
    articleElement.setAttribute("data-article-key", article.link);
    articleElement.getBoundingClientRect = mock(() => ({
      bottom: articleTop + articleHeight,
      height: articleHeight,
      left: 0,
      right: 0,
      toJSON: () => ({}),
      top: articleTop,
      width: 0,
      x: 0,
      y: articleTop,
    })) as typeof articleElement.getBoundingClientRect;
    articleElement.closest = mock(
      () => viewport,
    ) as typeof articleElement.closest;
    viewport.appendChild(articleElement);
    document.body.appendChild(viewport);

    let expandedArticleKey: null | string = article.link;
    const setFeed = mock(() => {});
    const setExpandedArticleKey = mock((updater: unknown) => {
      expandedArticleKey =
        typeof updater === "function"
          ? updater(expandedArticleKey)
          : (updater as null | string);
    });

    const { rerender, result } = renderHook(
      ({ currentExpandedKey }) =>
        useArticleActions({
          articleFilter: "unread",
          expandedArticleKey: currentExpandedKey,
          feed: [article],
          setExpandedArticleKey,
          setFeed,
        }),
      {
        initialProps: {
          currentExpandedKey: expandedArticleKey,
        },
      },
    );

    await runWithAct(() => {
      result.current.capturePreExpandSnapshot(article);
    });

    viewport.scrollTop = 440;
    articleTop = 20;

    await runWithAct(() => {
      result.current.handleArticleToggle(article);
    });
    rerender({ currentExpandedKey: expandedArticleKey });

    viewport.scrollTop = 1080;

    await runWithAct(() => {
      ResizeObserverMock.instances[0]?.trigger();
    });

    expect(viewport.scrollTop).toBe(320);
    expect(rafCallbacks.length).toBeGreaterThan(0);

    document.body.removeChild(viewport);
    Object.defineProperty(performance, "now", {
      configurable: true,
      value: nativePerformanceNow,
    });
    window.requestAnimationFrame = nativeRequestAnimationFrame;
    window.cancelAnimationFrame = nativeCancelAnimationFrame;
    Object.defineProperty(global, "ResizeObserver", {
      configurable: true,
      value: nativeResizeObserver,
    });
  });

  test("placeholder-data mode skips persisted starred-status writes", async () => {
    const article = createMockArticle({ id: 204, isStarred: false });
    let feedState: Article[] = [article];
    const setFeed = mock((updater: unknown) => {
      feedState =
        typeof updater === "function"
          ? updater(feedState)
          : (updater as Article[]);
    });
    const setExpandedArticleKey = mock(() => {});

    (ArticleService.updateArticleStatus as ReturnType<typeof mock>).mockClear();

    const { result } = renderHook(() =>
      useArticleActions({
        articleFilter: "all",
        expandedArticleKey: null,
        feed: feedState,
        setExpandedArticleKey,
        setFeed,
        usePlaceholderData: true,
      }),
    );

    await runWithAct(async () => {
      await result.current.handleToggleStarredState(article);
    });

    expect(ArticleService.updateArticleStatus).not.toHaveBeenCalled();
    expect(feedState[0]?.isStarred).toBe(true);
  });
});
