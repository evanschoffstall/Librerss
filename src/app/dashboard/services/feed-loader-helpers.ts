import type { Article } from "@/lib";
import type { BatchFeedResponseItem } from "@/lib/api/http";

import type { FeedBatchSource } from "../services/feed-batch";

import { getArticleKey } from "../services/article-collection";

/**
 * Classified feed batch error with a user-facing toast title and description.
 *
 * Separating classification from presentation lets callers decide whether to
 * show the toast at all (e.g. silent background refreshes).
 */
interface FeedBatchErrorToast {
  description: string;
  title: string;
}

/**
 * Classifies an error from a feed batch request into a user-actionable toast.
 *
 * The classifier duck-types the error shape to avoid importing `axios` into the
 * dashboard service layer.
 */
export function classifyFeedBatchError(error: unknown): FeedBatchErrorToast {
  const status = extractHttpStatus(error);
  const code = extractErrorCode(error);

  if (status === 401) {
    return {
      description: "Please sign in again to continue.",
      title: "Your session has expired.",
    };
  }

  if (status === 429) {
    return {
      description: "Please wait a moment before refreshing again.",
      title: "Too many requests.",
    };
  }

  if (
    code === "ECONNREFUSED" ||
    code === "ECONNRESET" ||
    code === "ENOTFOUND" ||
    code === "ERR_NETWORK"
  ) {
    return {
      description: "Check your connection and try again.",
      title: "Network error.",
    };
  }

  if (error instanceof Error && error.message === "Request timeout") {
    return {
      description: "The server took too long to respond. Try again shortly.",
      title: "Request timed out.",
    };
  }

  return {
    description: "Please try refreshing the selected source again.",
    title: "Unable to load this feed right now.",
  };
}

export function formatLastRefreshLabel(timestamp: Date | null): string {
  if (!timestamp) {
    return "never";
  }

  const elapsedMs = Date.now() - timestamp.getTime();
  if (elapsedMs < 60_000) {
    return "just now";
  }

  const elapsedMinutes = Math.floor(elapsedMs / 60_000);
  if (elapsedMinutes < 60) {
    return `${elapsedMinutes}m ago`;
  }

  const elapsedHours = Math.floor(elapsedMinutes / 60);
  if (elapsedHours < 24) {
    return `${elapsedHours}h ago`;
  }

  const elapsedDays = Math.floor(elapsedHours / 24);
  return `${elapsedDays}d ago`;
}

export function getNewestLastFetchedAt(
  batchResults: BatchFeedResponseItem[],
): Date | null {
  return batchResults.reduce<Date | null>((latest, item) => {
    if (!item.lastFetchedAt) {
      return latest;
    }

    if (!latest || item.lastFetchedAt > latest) {
      return item.lastFetchedAt;
    }

    return latest;
  }, null);
}

// ── Feed batch error classification ──────────────────────────────────────────

export function getSourceNamesByUrl(
  sources: FeedBatchSource[],
): Map<string, string | undefined> {
  return new Map(sources.map((source) => [source.url, source.name] as const));
}

export function isCanceledBatchRequest(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === "AbortError" || error.name === "CanceledError")
  );
}

/**
 * Merges locally-hydrated content from the previous feed into the freshly fetched
 * articles, then reuses the previous article object reference whenever all
 * display-relevant fields are unchanged.
 *
 * Reference stability is the key performance contract: Virtuoso and `React.memo`
 * can bail out of re-rendering any row whose article object reference hasn't
 * changed, so preserving these references during background auto-refreshes
 * prevents the entire visible list from re-rendering when no article content
 * actually changed.
 */
export function mergeHydratedContent(
  previousFeed: Article[],
  freshArticles: Article[],
): Article[] {
  if (previousFeed.length === 0) return freshArticles;

  const previousByLink = new Map<string, Article>();
  for (const a of previousFeed) {
    const link = a.link.trim();
    if (link) previousByLink.set(link, a);
  }

  return freshArticles.map((a) => {
    const link = a.link.trim();
    if (!link) return a;

    const prev = previousByLink.get(link);
    if (!prev) return a;

    // Restore hydrated content that the server doesn't store.
    const mergedContent = prev.content !== a.content ? prev.content : a.content;
    const merged: Article =
      mergedContent !== a.content ? { ...a, content: mergedContent } : a;

    // Reuse the previous reference when nothing that affects rendering changed.
    // This keeps Virtuoso item keys stable and lets React.memo skip rows that
    // haven't actually changed during an auto-refresh cycle.
    return articlesAreDisplayEqual(prev, merged) ? prev : merged;
  });
}

export function resolveExpandedArticleKey(
  currentKey: null | string,
  articles: Article[],
): null | string {
  if (!currentKey) {
    return null;
  }

  const hasExpandedArticle = articles.some(
    (article) => getArticleKey(article) === currentKey,
  );

  return hasExpandedArticle ? currentKey : null;
}

export function summarizeBatchResults(batchResults: BatchFeedResponseItem[]) {
  let okCount = 0;
  let missingCount = 0;
  let errorCount = 0;

  const articlesByUrl = batchResults.map((item) => {
    if (item.ok) {
      okCount += 1;
    } else {
      missingCount += 1;
    }

    if (item.error) {
      errorCount += 1;
    }

    return {
      articleCount: item.articles.length,
      error: item.error ?? null,
      ok: item.ok,
      url: item.url,
    };
  });

  return {
    articlesByUrl,
    errorCount,
    missingCount,
    okCount,
    resultCount: batchResults.length,
  };
}

/**
 * Merge hydrated (extracted) article content from the previous feed into
 * freshly-fetched articles so expanded articles retain their rich content
 * across any kind of dashboard refresh.
 */
/**
 * Returns true when all display-relevant fields are identical between two
 * article objects.  `lastChecked` is intentionally excluded because it updates
 * on every server fetch regardless of article content changes, and it has no
 * effect on how the article is rendered.
 */
function articlesAreDisplayEqual(prev: Article, next: Article): boolean {
  return (
    prev.content === next.content &&
    prev.title === next.title &&
    prev.isRead === next.isRead &&
    prev.isStarred === next.isStarred &&
    prev.hasFullContent === next.hasFullContent &&
    prev.feedName === next.feedName &&
    prev.feedUrl === next.feedUrl
  );
}

/** Extracts the error code (e.g. `ECONNRESET`) from an axios-shaped error, if present. */
function extractErrorCode(error: unknown): string | undefined {
  if (
    error &&
    typeof error === "object" &&
    "code" in error &&
    typeof error.code === "string"
  ) {
    return error.code;
  }
  return undefined;
}

export type { BatchFeedResponseItem as FeedBatchResult };

// ─── Refresh time formatting (merged from refresh-time.ts) ───────────────────

/** Extracts the HTTP status code from an axios-shaped error, if present. */
function extractHttpStatus(error: unknown): number | undefined {
  if (
    error &&
    typeof error === "object" &&
    "response" in error &&
    error.response &&
    typeof error.response === "object" &&
    "status" in error.response &&
    typeof error.response.status === "number"
  ) {
    return error.response.status;
  }
  return undefined;
}
