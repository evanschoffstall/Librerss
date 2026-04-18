import type { BatchFeedResponseItem } from "@/lib/api/http";
import type { Article } from "@/lib/core";

import { getArticleKey } from "@/app/dashboard/dashboard-services/article-collection";
import {
  mergeFeedArticleLocalState,
  retainMissingPreviousFeedArticles,
} from "@/app/dashboard/dashboard-services/feed-data";

/**
 * @param previousFeed
 * @param freshArticles
 * @param options
 * @param options.preserveLocalFeedState
 */
export function mergeHydratedContent(
  previousFeed: Article[],
  freshArticles: Article[],
  options?: { preserveLocalFeedState?: boolean },
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
 * @param currentKey
 * @param articles
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
 * @param batchResults
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
 * @param prev
 * @param next
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
