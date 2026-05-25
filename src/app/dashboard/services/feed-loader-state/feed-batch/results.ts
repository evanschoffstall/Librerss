import type { BatchFeedResponseItem } from "@/lib/api/http";
import type { Article } from "@/lib/core";

import { getArticleKey } from "@/app/dashboard/services/article-collection";
import {
  mergeFeedArticleLocalState,
  retainMissingPreviousFeedArticles,
} from "@/app/dashboard/services/feed-data";

/**
 * Describes the options for merge hydrated content.
 */
interface MergeHydratedContentOptions {
  preserveLocalFeedState?: boolean;
}

/**
 * Process the merge hydrated content.
 * @param previousFeed - The previous feed.
 * @param freshArticles - The fresh articles.
 * @param options - The options used to process the merge hydrated content.
 * @returns The merge hydrated content.
 */
export function mergeHydratedContent(
  previousFeed: Article[],
  freshArticles: Article[],
  options?: MergeHydratedContentOptions,
): Article[] {
  if (previousFeed.length === 0) return freshArticles;

  const preserveLocalFeedState = options?.preserveLocalFeedState ?? false;
  const previousByLink = new Map<string, Article>();

  for (const article of previousFeed) {
    const link = article.link.trim();
    if (link) {
      previousByLink.set(link, article);
    }
  }

  const mergedFreshArticles = freshArticles.map((article) => {
    const link = article.link.trim();
    if (!link) {
      return article;
    }

    const previousArticle = previousByLink.get(link);
    if (!previousArticle) {
      return article;
    }

    const mergedArticle = mergeFeedArticleLocalState(previousArticle, article, {
      preserveLocalFeedState,
    });

    return areArticlesDisplayEqual(previousArticle, mergedArticle)
      ? previousArticle
      : mergedArticle;
  });

  return preserveLocalFeedState
    ? retainMissingPreviousFeedArticles(previousFeed, mergedFreshArticles)
    : mergedFreshArticles;
}

/**
 * Resolve the expanded article key.
 * @param currentKey - The current key.
 * @param articles - The articles.
 * @returns The expanded article key.
 */
export function resolveExpandedArticleKey(
  currentKey: null | string,
  articles: Article[],
): null | string {
  if (!currentKey) {
    return null;
  }

  return articles.some((article) => getArticleKey(article) === currentKey)
    ? currentKey
    : null;
}

/**
 * Process the summarize batch results.
 * @param batchResults - The batch results.
 * @returns The summarize batch results.
 */
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

export type { BatchFeedResponseItem as FeedBatchResult };

/**
 * Process the are articles display equal.
 * @param prev - The prev.
 * @param next - The next.
 * @returns Whether are articles display equal.
 */
function areArticlesDisplayEqual(prev: Article, next: Article): boolean {
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
