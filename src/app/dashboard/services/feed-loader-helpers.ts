import type { Article } from "@/lib";
import type { BatchFeedResponseItem } from "@/lib/api/http";
import { getArticleKey } from "../services/article-collection";
import type { FeedBatchSource } from "../services/feed-batch";

export function isCanceledBatchRequest(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === "AbortError" || error.name === "CanceledError")
  );
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
      url: item.url,
      ok: item.ok,
      articleCount: item.articles.length,
      error: item.error ?? null,
    };
  });

  return {
    resultCount: batchResults.length,
    okCount,
    missingCount,
    errorCount,
    articlesByUrl,
  };
}

export function resolveExpandedArticleKey(
  currentKey: string | null,
  articles: Article[],
): string | null {
  if (!currentKey) {
    return null;
  }

  const hasExpandedArticle = articles.some(
    (article) => getArticleKey(article) === currentKey,
  );

  return hasExpandedArticle ? currentKey : null;
}

export function getSourceNamesByUrl(
  sources: FeedBatchSource[],
): Map<string, string | undefined> {
  return new Map(sources.map((source) => [source.url, source.name] as const));
}

/**
 * Merge hydrated (extracted) article content from the previous feed into
 * freshly-fetched articles so expanded articles retain their rich content
 * across any kind of dashboard refresh.
 */
export function mergeHydratedContent(
  previousFeed: Article[],
  freshArticles: Article[],
): Article[] {
  if (previousFeed.length === 0) return freshArticles;

  const previousContentByLink = new Map<string, string>();
  for (const a of previousFeed) {
    const link = a.link?.trim();
    if (link) previousContentByLink.set(link, a.content);
  }

  return freshArticles.map((a) => {
    const link = a.link?.trim();
    if (!link) return a;
    const prev = previousContentByLink.get(link);
    return prev && prev !== a.content ? { ...a, content: prev } : a;
  });
}

export type { BatchFeedResponseItem as FeedBatchResult };

// ─── Refresh time formatting (merged from refresh-time.ts) ───────────────────

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
