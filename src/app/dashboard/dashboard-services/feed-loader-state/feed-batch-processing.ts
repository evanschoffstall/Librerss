import type { BatchFeedResponseItem } from "@/lib/api/http";
import type { Article } from "@/lib/core";

import { getArticleKey } from "@/app/dashboard/dashboard-services/article-collection";
import {
  mergeFeedArticleLocalState,
  retainMissingPreviousFeedArticles,
} from "@/app/dashboard/dashboard-services/feed-data";

export {
  getNewestLastFetchedAt,
  getSourceNamesByUrl,
} from "@/app/dashboard/dashboard-services/feed-data/batch";

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
 * The classifier duck-types the error shape to avoid coupling the dashboard
 * service layer to a specific HTTP client implementation.
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

// ── Feed batch error classification ──────────────────────────────────────────

/**
 * Recognizes expected request-cancellation variants from browser aborts and
 * TanStack Query internals so overlapping pagination requests do not surface
 * as user-visible failures.
 */
export function isCanceledBatchRequest(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const errorName =
    "name" in error && typeof error.name === "string" ? error.name : null;

  return (
    errorName === "AbortError" ||
    errorName === "CanceledError" ||
    errorName === "CancelledError"
  );
}

/**
 * Merges locally-hydrated content from the previous feed into the freshly fetched
 * articles, then reuses the previous article object reference whenever all
 * display-relevant fields are unchanged.
 *
 * Reference stability is the key performance contract: the feed virtualizer and `React.memo`
 * can bail out of re-rendering any row whose article object reference hasn't
 * changed, so preserving these references during background auto-refreshes
 * prevents the entire visible list from re-rendering when no article content
 * actually changed.
 */
export function mergeHydratedContent(
  previousFeed: Article[],
  freshArticles: Article[],
  options?: { preserveLocalFeedState?: boolean },
): Article[] {
  if (previousFeed.length === 0) return freshArticles;

  const preserveLocalFeedState = options?.preserveLocalFeedState ?? false;

  const previousByLink = new Map<string, Article>();
  for (const a of previousFeed) {
    const link = a.link.trim();
    if (link) previousByLink.set(link, a);
  }

  const mergedFreshArticles = freshArticles.map((a) => {
    const link = a.link.trim();
    if (!link) return a;

    const prev = previousByLink.get(link);
    if (!prev) return a;

    const merged = mergeFeedArticleLocalState(prev, a, {
      preserveLocalFeedState,
    });

    // Reuse the previous reference when nothing that affects rendering changed.
    // This keeps virtualized row keys stable and lets React.memo skip rows that
    // haven't actually changed during an auto-refresh cycle.
    return articlesAreDisplayEqual(prev, merged) ? prev : merged;
  });

  if (!preserveLocalFeedState) {
    return mergedFreshArticles;
  }

  return retainMissingPreviousFeedArticles(previousFeed, mergedFreshArticles);
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

/** Extracts the error code (e.g. `ECONNRESET`) from an HTTP client error, if present. */
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

/** Extracts the HTTP status code from an HTTP client error, if present. */
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
