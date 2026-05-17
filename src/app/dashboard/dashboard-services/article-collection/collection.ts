import type { Article, ArticleSortOrder } from "@/lib/core";

import {
  dedupeArticleRecords,
  getNormalizedArticleRecordKey,
  preferRicherArticleRecord,
  sortArticleRecordsByPublicationDateDesc,
} from "@/lib/utils";

/**
 * Return the article key.
 * @param article - The article.
 * @returns The article key.
 */
export const getArticleKey = (article: Article) =>
  getNormalizedArticleRecordKey(article);

/**
 * Process the dedupe and sort articles.
 * @param articles - The articles.
 * @param articleSortOrder - The chronological display order to preserve after deduping.
 * @returns The dedupe and sort articles.
 */
export const dedupeAndSortArticles = (
  articles: Article[],
  articleSortOrder: ArticleSortOrder = "newest",
): Article[] => {
  const dedupedArticles = dedupeArticleRecords(
    articles,
    preferRicherArticleRecord,
  ).sort(sortArticleRecordsByPublicationDateDesc);

  return articleSortOrder === "oldest"
    ? dedupedArticles.reverse()
    : dedupedArticles;
};
