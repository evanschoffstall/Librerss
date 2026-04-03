import { describe, expect, test } from "bun:test";

import {
  DASHBOARD_PREVIEW_COOKIE_NAME,
  isDashboardPreviewModeEnabled,
  resolveDashboardPreviewMode,
  setDashboardPreviewPersistence,
} from "@/app/dashboard/preview-mode";
import { loadFeedSourceTree } from "@/app/dashboard/services/feed-source-tree";
import {
  getFeedBatchQueryKey,
  getFeedSourceTreeQueryKey,
} from "@/app/dashboard/services/query-keys";
import {
  AUTO_REFRESH_INTERVAL_STORAGE_KEY,
  MANUAL_REFRESH_INTERVAL_MINUTES,
  MIN_AUTO_REFRESH_INTERVAL_MINUTES,
  normalizeAutoRefreshIntervalMinutes,
  resolveDefaultAutoRefreshIntervalMinutes,
  toAutoRefreshIntervalMs,
} from "@/app/dashboard/services/refresh-policy";
import { collectFullyVisibleUnreadArticles } from "@/app/dashboard/services/viewport-read";
import {
  isRouteHandlerContext,
  resolveRouteHandlerDeps,
} from "@/lib/server/route-context";

describe("dashboard utility coverage", () => {
  test("query-key helpers encode filter, refresh policy, and sorted timestamps", () => {
    const knownLastFetchedAtByUrl = new Map([
      ["https://example.com/a.xml", new Date("2024-01-01T00:00:00.000Z")],
      ["https://example.com/b.xml", new Date("2024-01-02T00:00:00.000Z")],
    ]);

    expect(
      getFeedBatchQueryKey("request-signature", {
        articleFilter: "starred",
        knownLastFetchedAtByUrl,
        skipRefresh: true,
      }),
    ).toEqual([
      "dashboard",
      "feed-batch",
      "request-signature",
      "starred",
      "all-articles",
      "skip-refresh",
      "https://example.com/a.xml@2024-01-01T00:00:00.000Z|https://example.com/b.xml@2024-01-02T00:00:00.000Z",
    ]);

    expect(getFeedBatchQueryKey("request-signature")).toEqual([
      "dashboard",
      "feed-batch",
      "request-signature",
      "all",
      "all-articles",
      "refresh",
      "",
    ]);
    expect(getFeedSourceTreeQueryKey(true)).toEqual([
      "dashboard",
      "feed-source-tree",
      "placeholder",
    ]);
    expect(getFeedSourceTreeQueryKey(false)).toEqual([
      "dashboard",
      "feed-source-tree",
      "live",
    ]);
  });

  test("viewport-read returns an empty list without a viewport and auto-detects the mounted feed viewport", () => {
    const feed = [
      createArticle("https://example.com/a", false),
      createArticle("https://example.com/b", true),
    ];

    expect(collectFullyVisibleUnreadArticles(feed, null)).toEqual([]);

    const unrelatedViewport = document.createElement("div");
    unrelatedViewport.dataset.radixScrollAreaViewport = "";
    document.body.append(unrelatedViewport);

    const viewport = document.createElement("div");
    viewport.dataset.radixScrollAreaViewport = "";
    viewport.getBoundingClientRect = () => createRect(0, 0, 320, 400);

    const visibleArticle = document.createElement("article");
    visibleArticle.dataset.articleKey = "https://example.com/a";
    visibleArticle.getBoundingClientRect = () => createRect(0, 0, 320, 100);
    viewport.append(visibleArticle);
    document.body.append(viewport);

    expect(collectFullyVisibleUnreadArticles(feed)).toEqual([feed[0]]);
    document.body.innerHTML = "";
  });

  test("preview-mode helpers gate explore on the query and can clear legacy cookies", () => {
    const originalCookieDescriptor = Object.getOwnPropertyDescriptor(
      document,
      "cookie",
    );
    let cookieValue = "";

    Object.defineProperty(document, "cookie", {
      configurable: true,
      get: () => cookieValue,
      set: (value: string) => {
        cookieValue = value;
      },
    });

    expect(isDashboardPreviewModeEnabled("1")).toBe(true);
    expect(resolveDashboardPreviewMode({ hasExploreQuery: true })).toBe(true);
    expect(resolveDashboardPreviewMode({ hasExploreQuery: false })).toBe(false);

    setDashboardPreviewPersistence(true);
    expect(document.cookie).toContain(`${DASHBOARD_PREVIEW_COOKIE_NAME}=1`);

    setDashboardPreviewPersistence(false);
    expect(document.cookie).toContain(`${DASHBOARD_PREVIEW_COOKIE_NAME}=`);

    if (originalCookieDescriptor) {
      Object.defineProperty(document, "cookie", originalCookieDescriptor);
    }
  });

  test("refresh-policy helpers clamp intervals and derive milliseconds", () => {
    expect(AUTO_REFRESH_INTERVAL_STORAGE_KEY).toBe(
      "librerss:autoRefreshIntervalMinutes",
    );
    expect(MANUAL_REFRESH_INTERVAL_MINUTES).toBe(5);
    expect(MIN_AUTO_REFRESH_INTERVAL_MINUTES).toBe(30);
    expect(normalizeAutoRefreshIntervalMinutes(Number.NaN, 45)).toBe(45);
    expect(normalizeAutoRefreshIntervalMinutes(12)).toBe(30);
    expect(resolveDefaultAutoRefreshIntervalMinutes(44.6)).toBe(45);
    expect(toAutoRefreshIntervalMs(30)).toBe(1_800_000);
  });

  test("loadFeedSourceTree falls back to default categories when no live sources are returned", async () => {
    const fallbackCategories = [{ key: "all", label: "All Feeds" }];

    const result = await loadFeedSourceTree(false, {
      buildCategoriesFromSources: () => {
        throw new Error("empty sources should not build live categories");
      },
      buildDefaultCategories: () => fallbackCategories as never,
      getFeedSources: async () => [],
    });

    expect(result).toBe(fallbackCategories);
  });

  test("route-context helpers distinguish Next.js contexts from dependency bags", async () => {
    const context = {
      params: Promise.resolve({ id: "42" }),
    };

    expect(isRouteHandlerContext(context)).toBe(true);
    expect(isRouteHandlerContext({ params: { id: "42" } })).toBe(false);
    expect(resolveRouteHandlerDeps<{ value?: number }>(context)).toEqual({});
    expect(resolveRouteHandlerDeps({ value: 1 })).toEqual({ value: 1 });
    expect(await context.params).toEqual({ id: "42" });
  });
});

function createArticle(link: string, isRead: boolean) {
  return {
    content: link,
    feedId: 1,
    id: Number(link.endsWith("a") ? 1 : 2),
    isRead,
    lastChecked: new Date("2024-01-01T00:00:00.000Z"),
    link,
    publicationDate: new Date("2024-01-01T00:00:00.000Z"),
    title: link,
  };
}

function createRect(left: number, top: number, width: number, height: number) {
  return {
    bottom: top + height,
    height,
    left,
    right: left + width,
    toJSON: () => ({}),
    top,
    width,
    x: left,
    y: top,
  };
}