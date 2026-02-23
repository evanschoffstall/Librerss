/**
 * Component Tests: Dashboard Hooks
 * Tests for src/app/dashboard/hooks/
 */

import { describe, expect, test } from "bun:test";

// ─── useArticleNavigation ─────────────────────────────────────────────────────

describe("useArticleNavigation", () => {
  test("getNextArticle returns next article in list", async () => {
    const { getNextArticle } =
      await import("@/app/dashboard/hooks/useArticleNavigation");
    const articles = [
      { id: 1, title: "Article 1" },
      { id: 2, title: "Article 2" },
      { id: 3, title: "Article 3" },
    ];
    const next = getNextArticle(articles, 1);
    expect(next?.id).toBe(2);
  });

  test("getNextArticle returns null at end of list", async () => {
    const { getNextArticle } =
      await import("@/app/dashboard/hooks/useArticleNavigation");
    const articles = [
      { id: 1, title: "Article 1" },
      { id: 2, title: "Article 2" },
    ];
    const next = getNextArticle(articles, 2);
    expect(next).toBeNull();
  });

  test("getPreviousArticle returns previous article in list", async () => {
    const { getPreviousArticle } =
      await import("@/app/dashboard/hooks/useArticleNavigation");
    const articles = [
      { id: 1, title: "Article 1" },
      { id: 2, title: "Article 2" },
      { id: 3, title: "Article 3" },
    ];
    const prev = getPreviousArticle(articles, 3);
    expect(prev?.id).toBe(2);
  });

  test("getPreviousArticle returns null at start of list", async () => {
    const { getPreviousArticle } =
      await import("@/app/dashboard/hooks/useArticleNavigation");
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
  test("canRefreshFeed checks last refresh time", async () => {
    const { canRefreshFeed } =
      await import("@/app/dashboard/hooks/useFeedRefresh");
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

  test("canRefreshFeed allows refresh if never fetched", async () => {
    const { canRefreshFeed } =
      await import("@/app/dashboard/hooks/useFeedRefresh");
    const neverFetched = {
      id: 1,
      lastFetchedAt: null,
    };

    expect(canRefreshFeed(neverFetched, 5 * 60 * 1000)).toBe(true);
  });
});

// ─── useArticleActions ────────────────────────────────────────────────────────

describe("useArticleActions", () => {
  test("toggleRead switches read status", async () => {
    const { toggleReadStatus } =
      await import("@/app/dashboard/hooks/useArticleActions");
    expect(toggleReadStatus(true)).toBe(false);
    expect(toggleReadStatus(false)).toBe(true);
  });

  test("toggleStarred switches starred status", async () => {
    const { toggleStarredStatus } =
      await import("@/app/dashboard/hooks/useArticleActions");
    expect(toggleStarredStatus(true)).toBe(false);
    expect(toggleStarredStatus(false)).toBe(true);
  });
});
