import { describe, expect, test } from "bun:test";

import {
  resolveArticleWindowAvailability,
  shouldBlockArticleWindowLoadMore,
  shouldRefillDepletedUnreadWindow,
} from "@/app/dashboard/services/article-window-availability";

describe("dashboard article window availability", () => {
  test("disables server pagination completely when the article window is inactive", () => {
    expect(
      resolveArticleWindowAvailability({
        allowPartialFeedGrowth: false,
        currentFeedLength: 12,
        hasStartedAwaitedWindowSettlement: false,
        isAwaitingWindowSettlement: false,
        isLoading: false,
        previousFeedLength: 0,
        previousHasMoreServerArticles: true,
        requestedArticleLimit: 12,
        shouldUseArticleWindow: false,
      }),
    ).toEqual({
      hasMoreServerArticles: false,
      shouldClearAwaitingWindowSettlement: true,
    });
  });

  test("keeps the previous availability signal while an awaited window is still loading", () => {
    expect(
      resolveArticleWindowAvailability({
        allowPartialFeedGrowth: false,
        currentFeedLength: 6,
        hasStartedAwaitedWindowSettlement: false,
        isAwaitingWindowSettlement: true,
        isLoading: true,
        previousFeedLength: 0,
        previousHasMoreServerArticles: true,
        requestedArticleLimit: 12,
        shouldUseArticleWindow: true,
      }),
    ).toEqual({
      hasMoreServerArticles: true,
      shouldClearAwaitingWindowSettlement: false,
    });
  });

  test("treats partial growth during settlement as proof that more server articles remain", () => {
    expect(
      resolveArticleWindowAvailability({
        allowPartialFeedGrowth: true,
        currentFeedLength: 14,
        hasStartedAwaitedWindowSettlement: true,
        isAwaitingWindowSettlement: true,
        isLoading: false,
        previousFeedLength: 12,
        previousHasMoreServerArticles: false,
        requestedArticleLimit: 24,
        shouldUseArticleWindow: true,
      }),
    ).toEqual({
      hasMoreServerArticles: true,
      shouldClearAwaitingWindowSettlement: true,
    });
  });

  test("marks the source exhausted once a settled awaited window returns fewer items than requested", () => {
    expect(
      resolveArticleWindowAvailability({
        allowPartialFeedGrowth: false,
        currentFeedLength: 11,
        hasStartedAwaitedWindowSettlement: true,
        isAwaitingWindowSettlement: true,
        isLoading: false,
        previousFeedLength: 8,
        previousHasMoreServerArticles: true,
        requestedArticleLimit: 12,
        shouldUseArticleWindow: true,
      }),
    ).toEqual({
      hasMoreServerArticles: false,
      shouldClearAwaitingWindowSettlement: true,
    });
  });

  test("preserves the previous availability signal until the next awaited fetch settles", () => {
    expect(
      resolveArticleWindowAvailability({
        allowPartialFeedGrowth: false,
        currentFeedLength: 11,
        hasStartedAwaitedWindowSettlement: false,
        isAwaitingWindowSettlement: false,
        isLoading: false,
        previousFeedLength: 12,
        previousHasMoreServerArticles: true,
        requestedArticleLimit: 12,
        shouldUseArticleWindow: true,
      }),
    ).toEqual({
      hasMoreServerArticles: true,
      shouldClearAwaitingWindowSettlement: false,
    });
  });

  test("blocks load-more while the live article window is still booting or already busy", () => {
    expect(
      shouldBlockArticleWindowLoadMore({
        currentFeedLength: 0,
        hasMoreServerArticles: true,
        isCategoriesLoading: false,
        isLoadingMoreArticles: false,
        shouldUseArticleWindow: true,
      }),
    ).toBe(true);

    expect(
      shouldBlockArticleWindowLoadMore({
        currentFeedLength: 12,
        hasMoreServerArticles: true,
        isCategoriesLoading: true,
        isLoadingMoreArticles: false,
        shouldUseArticleWindow: true,
      }),
    ).toBe(true);

    expect(
      shouldBlockArticleWindowLoadMore({
        currentFeedLength: 12,
        hasMoreServerArticles: false,
        isCategoriesLoading: false,
        isLoadingMoreArticles: false,
        shouldUseArticleWindow: true,
      }),
    ).toBe(true);

    expect(
      shouldBlockArticleWindowLoadMore({
        currentFeedLength: 12,
        hasMoreServerArticles: true,
        isCategoriesLoading: false,
        isLoadingMoreArticles: true,
        shouldUseArticleWindow: true,
      }),
    ).toBe(true);

    expect(
      shouldBlockArticleWindowLoadMore({
        currentFeedLength: 12,
        hasMoreServerArticles: true,
        isCategoriesLoading: false,
        isLoadingMoreArticles: false,
        shouldUseArticleWindow: true,
      }),
    ).toBe(false);
  });

  test("only refills an unread window when local read updates emptied the filtered view", () => {
    expect(
      shouldRefillDepletedUnreadWindow({
        articleFilter: "unread",
        articlesPerPage: 4,
        currentFeedLength: 12,
        currentFilteredFeedLength: 4,
        hasMoreServerArticles: true,
        isLoading: false,
        isRefillingDepletedUnreadWindow: false,
        shouldUseArticleWindow: true,
      }),
    ).toBe(true);

    expect(
      shouldRefillDepletedUnreadWindow({
        articleFilter: "all",
        articlesPerPage: 4,
        currentFeedLength: 12,
        currentFilteredFeedLength: 0,
        hasMoreServerArticles: true,
        isLoading: false,
        isRefillingDepletedUnreadWindow: false,
        shouldUseArticleWindow: true,
      }),
    ).toBe(false);

    expect(
      shouldRefillDepletedUnreadWindow({
        articleFilter: "unread",
        articlesPerPage: 4,
        currentFeedLength: 12,
        currentFilteredFeedLength: 5,
        hasMoreServerArticles: true,
        isLoading: false,
        isRefillingDepletedUnreadWindow: false,
        shouldUseArticleWindow: true,
      }),
    ).toBe(false);
  });
});