import { describe, expect, test } from "bun:test";

import type { Article } from "@/lib";
import type { BatchFeedResponseItem } from "@/lib/api/http";

import {
  formatLastRefreshLabel,
  getNewestLastFetchedAt,
  getSourceNamesByUrl,
  isCanceledBatchRequest,
  mergeHydratedContent,
  resolveExpandedArticleKey,
  summarizeBatchResults,
} from "@/app/dashboard/services/feed-loader-helpers";

function makeArticle(overrides: Partial<Article> = {}): Article {
  return {
    content: "default content",
    feedId: 1,
    id: 1,
    isRead: false,
    isStarred: false,
    lastChecked: new Date(),
    link: "https://example.com/article",
    publicationDate: new Date(),
    title: "Default Title",
    ...overrides,
  };
}

// ─── formatLastRefreshLabel ──────────────────────────────────────────────────

describe("formatLastRefreshLabel", () => {
  test("returns 'never' for null", () => {
    expect(formatLastRefreshLabel(null)).toBe("never");
  });

  test("returns 'just now' for < 60s ago", () => {
    expect(formatLastRefreshLabel(new Date())).toBe("just now");
  });

  test("returns minutes ago", () => {
    const fiveMinAgo = new Date(Date.now() - 5 * 60_000);
    expect(formatLastRefreshLabel(fiveMinAgo)).toBe("5m ago");
  });

  test("returns hours ago", () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60_000);
    expect(formatLastRefreshLabel(twoHoursAgo)).toBe("2h ago");
  });

  test("returns days ago", () => {
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60_000);
    expect(formatLastRefreshLabel(threeDaysAgo)).toBe("3d ago");
  });
});

// ─── getNewestLastFetchedAt ──────────────────────────────────────────────────

describe("getNewestLastFetchedAt", () => {
  test("returns null for empty array", () => {
    expect(getNewestLastFetchedAt([])).toBeNull();
  });

  test("returns null when no items have lastFetchedAt", () => {
    const items: BatchFeedResponseItem[] = [
      { articles: [], ok: true, url: "https://a.example" },
    ];
    expect(getNewestLastFetchedAt(items)).toBeNull();
  });

  test("returns the newest date", () => {
    const older = new Date("2024-01-01");
    const newer = new Date("2024-06-01");
    const items: BatchFeedResponseItem[] = [
      { articles: [], lastFetchedAt: older, ok: true, url: "https://a.example" },
      { articles: [], lastFetchedAt: newer, ok: true, url: "https://b.example" },
    ];
    expect(getNewestLastFetchedAt(items)).toEqual(newer);
  });
});

// ─── getSourceNamesByUrl ─────────────────────────────────────────────────────

test("getSourceNamesByUrl maps source URLs to names", () => {
  const sources = [
    { name: "Feed A", url: "https://a.example/rss" },
    { name: undefined, url: "https://b.example/rss" },
  ];
  const result = getSourceNamesByUrl(sources as any);
  expect(result.get("https://a.example/rss")).toBe("Feed A");
  expect(result.get("https://b.example/rss")).toBeUndefined();
});

// ─── isCanceledBatchRequest ──────────────────────────────────────────────────

describe("isCanceledBatchRequest", () => {
  test("returns true for AbortError", () => {
    const err = new Error("aborted");
    err.name = "AbortError";
    expect(isCanceledBatchRequest(err)).toBe(true);
  });

  test("returns true for CanceledError", () => {
    const err = new Error("canceled");
    err.name = "CanceledError";
    expect(isCanceledBatchRequest(err)).toBe(true);
  });

  test("returns false for other errors", () => {
    expect(isCanceledBatchRequest(new Error("network"))).toBe(false);
  });

  test("returns false for non-error values", () => {
    expect(isCanceledBatchRequest("string")).toBe(false);
    expect(isCanceledBatchRequest(null)).toBe(false);
  });
});

// ─── mergeHydratedContent ────────────────────────────────────────────────────

describe("mergeHydratedContent", () => {
  test("returns fresh articles unchanged when previous is empty", () => {
    const fresh = [makeArticle({ content: "new", link: "https://a.example" })];
    expect(mergeHydratedContent([], fresh)).toBe(fresh);
  });

  test("preserves previous content for matching links", () => {
    const prev = [
      makeArticle({ content: "rich HTML content", link: "https://a.example" }),
    ];
    const fresh = [
      makeArticle({ content: "plain", link: "https://a.example" }),
    ];
    const merged = mergeHydratedContent(prev, fresh);
    expect(merged[0]!.content).toBe("rich HTML content");
  });

  test("keeps fresh content when no previous match", () => {
    const prev = [
      makeArticle({ content: "old", link: "https://old.example" }),
    ];
    const fresh = [
      makeArticle({ content: "fresh", link: "https://new.example" }),
    ];
    const merged = mergeHydratedContent(prev, fresh);
    expect(merged[0]!.content).toBe("fresh");
  });

  test("does not merge when content is identical", () => {
    const prev = [
      makeArticle({ content: "same", link: "https://a.example" }),
    ];
    const fresh = [
      makeArticle({ content: "same", link: "https://a.example" }),
    ];
    const merged = mergeHydratedContent(prev, fresh);
    expect(merged[0]).toBe(fresh[0]);
  });
});

// ─── resolveExpandedArticleKey ───────────────────────────────────────────────

describe("resolveExpandedArticleKey", () => {
  test("returns null when currentKey is null", () => {
    expect(resolveExpandedArticleKey(null, [])).toBeNull();
  });

  test("returns key when article exists with that key", () => {
    const articles = [makeArticle({ link: "https://match.example" })];
    expect(
      resolveExpandedArticleKey("https://match.example", articles),
    ).toBe("https://match.example");
  });

  test("returns null when no article matches key", () => {
    const articles = [makeArticle({ link: "https://other.example" })];
    expect(
      resolveExpandedArticleKey("https://missing.example", articles),
    ).toBeNull();
  });
});

// ─── summarizeBatchResults ───────────────────────────────────────────────────

describe("summarizeBatchResults", () => {
  test("summarizes mixed batch results", () => {
    const results: BatchFeedResponseItem[] = [
      { articles: [makeArticle()], ok: true, url: "https://a.example" },
      {
        articles: [],
        error: "timeout",
        ok: false,
        url: "https://b.example",
      },
      { articles: [], ok: true, url: "https://c.example" },
    ];
    const summary = summarizeBatchResults(results);
    expect(summary.okCount).toBe(2);
    expect(summary.missingCount).toBe(1);
    expect(summary.errorCount).toBe(1);
    expect(summary.resultCount).toBe(3);
    expect(summary.articlesByUrl).toHaveLength(3);
    expect(summary.articlesByUrl[0]!.articleCount).toBe(1);
  });

  test("returns zeros for empty results", () => {
    const summary = summarizeBatchResults([]);
    expect(summary.okCount).toBe(0);
    expect(summary.missingCount).toBe(0);
    expect(summary.errorCount).toBe(0);
    expect(summary.resultCount).toBe(0);
  });
});
