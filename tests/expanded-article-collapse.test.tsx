import type { SetStateAction } from "react";

import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, mock, test } from "bun:test";

import type { Article } from "@/lib/core";

import { useExpandedArticleCollapse } from "@/app/dashboard/dashboard-hooks/article-actions/useExpandedArticleCollapse";

afterEach(() => {
  mock.restore();
});

function buildArticle(overrides: Partial<Article> = {}): Article {
  return {
    content: "Test content",
    feedId: 1,
    feedName: "Test Feed",
    feedUrl: "https://example.com/feed",
    id: 1,
    isRead: false,
    isStarred: false,
    lastChecked: new Date(),
    link: "https://example.com/article",
    publicationDate: new Date("2024-01-01T00:00:00.000Z"),
    title: "Test Article",
    ...overrides,
  };
}

describe("useExpandedArticleCollapse", () => {
  /**
   * Regression: expansion ownership used to split across the restore effect
   * and toggle handler. The restore effect could start hydration while the
   * explicit toggle path was still waiting on read-state persistence, creating
   * duplicate hydration and visible loading flashes.
   *
   * The fix marks expansion handled and starts hydration before the expanded
   * key is committed. The next render therefore sees both ownership guards and
   * the hydrating link state together.
   */
  test("starts hydration before committing the expanded article key", async () => {
    const article = buildArticle({ isRead: false });
    let expandedArticleKey: null | string = null;

    let resolveMarkRead!: () => void;
    const markReadPromise = new Promise<boolean>((resolve) => {
      resolveMarkRead = () => resolve(true);
    });

    const setArticleReadState = mock(async () => {
      await markReadPromise;
      return true;
    });
    const hydrateArticleContent = mock(async (_article: Article) => {});
    const capturedMarkedKeys: string[] = [];
    const markExpandedArticleHydrationHandled = (key: string) => {
      capturedMarkedKeys.push(key);
    };

    const setExpandedArticleKey = mock(
      (updater: SetStateAction<null | string>) => {
        expandedArticleKey =
          typeof updater === "function" ? updater(expandedArticleKey) : updater;
        // Confirm that the ref guard was set BEFORE the React state update fires.
        expect(capturedMarkedKeys).toContain(article.link);
        expect(hydrateArticleContent).toHaveBeenCalledTimes(1);
      },
    );

    const { result } = renderHook(() =>
      useExpandedArticleCollapse({
        articleFilter: "all",
        cancelCollapseScrollRestore: mock(() => {}),
        cancelHydration: mock((_articleLink: string) => {}),
        clearExpandedArticleHydrationTracking: mock(() => {}),
        clearRemovalAnimation: mock((_articleKey: string) => {}),
        expandedArticleKey,
        hydrateArticleContent,
        restoreCollapseScrollPosition: mock((_articleKey: string) => {}),
        setArticleReadState,
        setExpandedArticleKey,
        startRemovalAnimation: mock(
          (
            _article: Article,
            _mode: "collapse" | "de-expanding" | "swipe-read",
          ) => {},
        ),
        updatingArticleState: {},
      }),
    );

    const togglePromise = act(async () => {
      await result.current.handleArticleToggle(
        article,
        markExpandedArticleHydrationHandled,
      );
    });

    // Simulate hydration #1 completing with null (no stored content) before
    // markArticleReadIfNeeded resolves — this is the race that caused the flash.
    resolveMarkRead();

    await togglePromise;

    // hydrateArticleContent must be invoked exactly once, not twice.
    expect(hydrateArticleContent).toHaveBeenCalledTimes(1);
    expect(hydrateArticleContent).toHaveBeenCalledWith(article);
  });

  test("restores collapse scroll only after the expanded article key clears", async () => {
    const article = buildArticle();
    let expandedArticleKey: null | string = article.link;

    const restoreCollapseScrollPosition = mock((_articleKey: string) => {});
    const setExpandedArticleKey = mock(
      (updater: SetStateAction<null | string>) => {
        expandedArticleKey =
          typeof updater === "function" ? updater(expandedArticleKey) : updater;
      },
    );

    const { rerender, result } = renderHook(
      ({ currentExpandedKey }) =>
        useExpandedArticleCollapse({
          articleFilter: "all",
          cancelCollapseScrollRestore: mock(() => {}),
          cancelHydration: mock((_articleLink: string) => {}),
          clearExpandedArticleHydrationTracking: mock(() => {}),
          clearRemovalAnimation: mock((_articleKey: string) => {}),
          expandedArticleKey: currentExpandedKey,
          hydrateArticleContent: mock(async (_article: Article) => {}),
          restoreCollapseScrollPosition,
          setArticleReadState: mock(
            async (
              _article: Article,
              _nextReadState: boolean,
              _options?: { suppressErrorToast?: boolean },
            ) => true,
          ),
          setExpandedArticleKey,
          startRemovalAnimation: mock(
            (
              _article: Article,
              _mode: "collapse" | "de-expanding" | "swipe-read",
            ) => {},
          ),
          updatingArticleState: {},
        }),
      {
        initialProps: {
          currentExpandedKey: expandedArticleKey,
        },
      },
    );

    await act(async () => {
      await result.current.handleArticleToggle(article, () => {});
    });

    expect(expandedArticleKey).toBeNull();
    expect(restoreCollapseScrollPosition).toHaveBeenCalledTimes(0);

    rerender({ currentExpandedKey: expandedArticleKey });

    await waitFor(() => {
      expect(restoreCollapseScrollPosition).toHaveBeenCalledTimes(1);
    });
    expect(restoreCollapseScrollPosition).toHaveBeenCalledWith(article.link);
  });
});
