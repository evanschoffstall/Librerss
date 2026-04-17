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
            (_article: Article, _mode: "collapse" | "de-expanding" | "swipe-read") => {},
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