import type { Article } from "@/lib/core";

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
 * @returns The dedupe and sort articles.
 */
export const dedupeAndSortArticles = (articles: Article[]): Article[] => {
  return dedupeArticleRecords(articles, preferRicherArticleRecord).sort(
    sortArticleRecordsByPublicationDateDesc,
  );
};
