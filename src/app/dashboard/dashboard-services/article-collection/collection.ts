import type { Article } from "@/lib/core";

import {
  dedupeArticleRecords,
  getNormalizedArticleRecordKey,
  preferRicherArticleRecord,
  sortArticleRecordsByPublicationDateDesc,
} from "@/lib/utils";

/**
 * @param article
 */
export const getArticleKey = (article: Article) =>
  getNormalizedArticleRecordKey(article);

/**
 * @param articles
 */
export const dedupeAndSortArticles = (articles: Article[]): Article[] => {
  return dedupeArticleRecords(articles, preferRicherArticleRecord).sort(
    sortArticleRecordsByPublicationDateDesc,
  );
};
