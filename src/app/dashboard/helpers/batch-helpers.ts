/**
 * Helpers for mapping batch feed-fetch results into article lists.
 */

import { type Article } from "@/lib";
import { dedupeAndSortArticles } from "./article-helpers";

export interface FeedBatchSource {
  url: string;
  name: string | undefined;
}

interface BatchResultItem {
  url: string;
  articles: Article[];
  ok: boolean;
  error?: string;
}

function enrichFeedArticles(
  articles: Article[],
  feedUrl: string,
  feedName: string | undefined,
): Article[] {
  return articles.map((article) => ({
    ...article,
    feedName,
    feedUrl,
  }));
}

/**
 * Maps raw batch-fetch results into a flat, deduplicated, sorted article list.
 *
 * For successful responses, enriches each article with `feedName` / `feedUrl`.
 * Falls back to placeholder data when `usePlaceholderData` is true.
 */
export function mapBatchResultsToArticles(
  batchResults: BatchResultItem[],
  sourceNameByUrl: Map<string, string | undefined>,
  usePlaceholderData: boolean,
  getPlaceholderArticles: (url: string) => Article[],
): Article[] {
  const perFeedArticles = batchResults.map((result): Article[] | null => {
    const feedName = sourceNameByUrl.get(result.url);

    if (result.ok && result.articles.length > 0) {
      return enrichFeedArticles(result.articles, result.url, feedName);
    }

    if (usePlaceholderData) {
      return enrichFeedArticles(
        getPlaceholderArticles(result.url),
        result.url,
        feedName,
      );
    }

    return null;
  });

  return dedupeAndSortArticles(
    perFeedArticles
      .filter((result): result is Article[] => Array.isArray(result))
      .flat(),
  );
}
