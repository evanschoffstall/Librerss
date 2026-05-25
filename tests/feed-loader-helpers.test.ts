import { describe, expect, test } from "bun:test";

import type { BatchFeedResponseItem } from "@/lib/api/http";
import type { Article } from "@/lib/core";

import {
  classifyFeedBatchError,
  formatLastRefreshLabel,
  getNewestLastFetchedAt,
  getSourceNamesByUrl,
  isCanceledBatchRequest,
  isHandledFeedBatchError,
  mergeHydratedContent,
  resolveExpandedArticleKey,
  summarizeBatchResults,
} from "@/app/dashboard/services/feed-loader-state";

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
      {
        articles: [],
        lastFetchedAt: older,
        ok: true,
        url: "https://a.example",
      },
      {
        articles: [],
        lastFetchedAt: newer,
        ok: true,
        url: "https://b.example",
      },
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

  test("returns true for CancelledError", () => {
    const err = new Error("cancelled");
    err.name = "CancelledError";
    expect(isCanceledBatchRequest(err)).toBe(true);
  });

  test("returns true for TanStack cancellation errors reported by message", () => {
    const err = new Error("CancelledError");
    err.name = "Error";
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

  test("preserveLocalFeedState retains previously loaded older articles missing from fresh payload", () => {
    const prev = [
      makeArticle({
        link: "https://example.com/newer",
        title: "Newer",
      }),
      makeArticle({
        link: "https://example.com/older",
        title: "Older",
      }),
    ];
    const fresh = [
      makeArticle({
        link: "https://example.com/newer",
        title: "Newer (refetched)",
      }),
    ];

    const merged = mergeHydratedContent(prev, fresh, {
      preserveLocalFeedState: true,
    });

    expect(merged).toHaveLength(2);
    expect(merged[0]?.link).toBe("https://example.com/newer");
    expect(merged[1]?.link).toBe("https://example.com/older");
  });

  test("keeps fresh content when no previous match", () => {
    const prev = [makeArticle({ content: "old", link: "https://old.example" })];
    const fresh = [
      makeArticle({ content: "fresh", link: "https://new.example" }),
    ];
    const merged = mergeHydratedContent(prev, fresh);
    expect(merged[0]!.content).toBe("fresh");
  });

  test("does not merge when content is identical, returns prev for reference stability", () => {
    const prev = [makeArticle({ content: "same", link: "https://a.example" })];
    const fresh = [makeArticle({ content: "same", link: "https://a.example" })];
    const merged = mergeHydratedContent(prev, fresh);
    // Prev reference is reused when all display fields match so the virtualizer and
    // React.memo can skip re-rendering unchanged rows during auto-refresh.
    expect(merged[0]).toBe(prev[0]);
  });

  test("returns fresh reference when a display field changed (isRead)", () => {
    const prev = [
      makeArticle({
        content: "same",
        isRead: false,
        link: "https://a.example",
      }),
    ];
    const fresh = [
      makeArticle({ content: "same", isRead: true, link: "https://a.example" }),
    ];
    const merged = mergeHydratedContent(prev, fresh);
    expect(merged[0]!.isRead).toBe(true);
    expect(merged[0]).toBe(fresh[0]);
  });

  test("preserves local read state during keepExistingFeed merges", () => {
    const prev = [
      makeArticle({
        content: "same",
        hasFullContent: true,
        isRead: true,
        link: "https://a.example",
      }),
    ];
    const fresh = [
      makeArticle({
        content: "plain",
        hasFullContent: false,
        isRead: false,
        link: "https://a.example",
      }),
    ];

    const merged = mergeHydratedContent(prev, fresh, {
      preserveLocalFeedState: true,
    });

    expect(merged[0]!.isRead).toBe(true);
    expect(merged[0]!.hasFullContent).toBe(true);
    expect(merged[0]!.content).toBe("same");
  });

  test("returns fresh reference when a display field changed (isStarred)", () => {
    const prev = [
      makeArticle({
        content: "x",
        isStarred: false,
        link: "https://a.example",
      }),
    ];
    const fresh = [
      makeArticle({ content: "x", isStarred: true, link: "https://a.example" }),
    ];
    const merged = mergeHydratedContent(prev, fresh);
    expect(merged[0]!.isStarred).toBe(true);
    expect(merged[0]).toBe(fresh[0]);
  });

  test("preserves local starred state during keepExistingFeed merges", () => {
    const prev = [
      makeArticle({ content: "x", isStarred: true, link: "https://a.example" }),
    ];
    const fresh = [
      makeArticle({
        content: "x",
        isStarred: false,
        link: "https://a.example",
      }),
    ];

    const merged = mergeHydratedContent(prev, fresh, {
      preserveLocalFeedState: true,
    });

    expect(merged[0]!.isStarred).toBe(true);
  });
});

// ─── resolveExpandedArticleKey ───────────────────────────────────────────────

describe("resolveExpandedArticleKey", () => {
  test("returns null when currentKey is null", () => {
    expect(resolveExpandedArticleKey(null, [])).toBeNull();
  });

  test("returns key when article exists with that key", () => {
    const articles = [makeArticle({ link: "https://match.example" })];
    expect(resolveExpandedArticleKey("https://match.example", articles)).toBe(
      "https://match.example",
    );
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

// ─── classifyFeedBatchError ──────────────────────────────────────────────────

describe("classifyFeedBatchError", () => {
  test("classifies 401 as session expired", () => {
    const error = Object.assign(new Error("Unauthorized"), {
      response: { status: 401 },
    });
    const result = classifyFeedBatchError(error);
    expect(result.title).toBe("Your session has expired.");
    expect(result.description).toContain("sign in");
  });

  test("classifies 429 as rate limited", () => {
    const error = Object.assign(new Error("Too Many Requests"), {
      response: { status: 429 },
    });
    const result = classifyFeedBatchError(error);
    expect(result.title).toBe("Too many requests.");
    expect(result.description).toContain("wait");
  });

  test("classifies ECONNREFUSED as network error", () => {
    const error = Object.assign(new Error("connect ECONNREFUSED"), {
      code: "ECONNREFUSED",
    });
    const result = classifyFeedBatchError(error);
    expect(result.title).toBe("Network error.");
    expect(result.description).toContain("connection");
  });

  test("classifies ECONNRESET as network error", () => {
    const error = Object.assign(new Error("socket hang up"), {
      code: "ECONNRESET",
    });
    const result = classifyFeedBatchError(error);
    expect(result.title).toBe("Network error.");
  });

  test("classifies ENOTFOUND as network error", () => {
    const error = Object.assign(new Error("getaddrinfo ENOTFOUND"), {
      code: "ENOTFOUND",
    });
    const result = classifyFeedBatchError(error);
    expect(result.title).toBe("Network error.");
  });

  test("classifies ERR_NETWORK as network error", () => {
    const error = Object.assign(new Error("Network Error"), {
      code: "ERR_NETWORK",
    });
    const result = classifyFeedBatchError(error);
    expect(result.title).toBe("Network error.");
  });

  test("classifies Request timeout message", () => {
    const error = new Error("Request timeout");
    const result = classifyFeedBatchError(error);
    expect(result.title).toBe("Request timed out.");
    expect(result.description).toContain("too long");
  });

  test("returns generic message for unknown errors", () => {
    const result = classifyFeedBatchError(new Error("something broke"));
    expect(result.title).toBe("Unable to load this feed right now.");
    expect(result.description).toContain("refreshing");
  });

  test("returns generic message for non-Error values", () => {
    const result = classifyFeedBatchError("string error");
    expect(result.title).toBe("Unable to load this feed right now.");
  });

  test("returns generic message for null", () => {
    const result = classifyFeedBatchError(null);
    expect(result.title).toBe("Unable to load this feed right now.");
  });

  test("prefers HTTP status over error code when both present", () => {
    const error = Object.assign(new Error("rate limited"), {
      code: "ECONNRESET",
      response: { status: 429 },
    });
    const result = classifyFeedBatchError(error);
    expect(result.title).toBe("Too many requests.");
  });

  test("classifies proxy-password-unreadable reason as proxy credentials unavailable", () => {
    // Server responds 500 with { error: "...", reason: "proxy-password-unreadable" }
    const error = Object.assign(
      new Error("Request failed with status code 500"),
      {
        response: {
          data: {
            error: "Proxy password could not be read",
            reason: "proxy-password-unreadable",
          },
          status: 500,
        },
      },
    );
    const result = classifyFeedBatchError(error);
    expect(result.title).toBe("Proxy credentials unavailable.");
    expect(result.description).toContain("proxy password");
    expect(result.description).toContain("Settings");
  });

  test("handles proxy-password-unreadable even when status code is absent", () => {
    const error = Object.assign(new Error("Internal Server Error"), {
      response: {
        data: { reason: "proxy-password-unreadable" },
      },
    });
    const result = classifyFeedBatchError(error);
    expect(result.title).toBe("Proxy credentials unavailable.");
  });

  test("does not classify unknown reason as proxy error", () => {
    const error = Object.assign(new Error("Internal Server Error"), {
      response: {
        data: { reason: "some-other-reason" },
        status: 500,
      },
    });
    const result = classifyFeedBatchError(error);
    expect(result.title).toBe("Unable to load this feed right now.");
  });

  test("does not classify 500 without reason as proxy error", () => {
    const error = Object.assign(new Error("Internal Server Error"), {
      response: { data: {}, status: 500 },
    });
    const result = classifyFeedBatchError(error);
    expect(result.title).toBe("Unable to load this feed right now.");
  });
});

describe("isHandledFeedBatchError", () => {
  test("returns true for rate limits, gateway timeouts, and proxy credential errors", () => {
    expect(
      isHandledFeedBatchError(
        Object.assign(new Error("Too Many Requests"), {
          response: { status: 429 },
        }),
      ),
    ).toBe(true);
    expect(
      isHandledFeedBatchError(
        Object.assign(new Error("Gateway Timeout"), {
          response: { status: 504 },
        }),
      ),
    ).toBe(true);
    expect(
      isHandledFeedBatchError(
        Object.assign(new Error("Proxy password unavailable"), {
          response: {
            data: { reason: "proxy-password-unreadable" },
            status: 500,
          },
        }),
      ),
    ).toBe(true);
  });

  test("returns false for unknown failures", () => {
    expect(isHandledFeedBatchError(new Error("boom"))).toBe(false);
  });
});
