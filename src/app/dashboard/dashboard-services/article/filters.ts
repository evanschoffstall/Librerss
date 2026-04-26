import { getArticleKey } from "@/app/dashboard/dashboard-services/article-collection";
import {
  type Article,
  ARTICLE_FILTERS,
  ARTICLE_SORT_ORDERS,
  type ArticleFilter,
  type ArticleSortOrder,
} from "@/lib/core";
import { parseDateOrNull } from "@/lib/utils";

export const ARTICLE_FILTER_OPTIONS = ARTICLE_FILTERS;
export const ARTICLE_SORT_ORDER_OPTIONS = ARTICLE_SORT_ORDERS;
export type { ArticleFilter, ArticleSortOrder };

/**
 * Process the filter articles by state.
 * @param articles - The articles.
 * @param articleFilter - The article filter.
 * @param expandedArticleKey - The expanded article key.
 * @param collapsingArticleKeys - The collapsing article keys.
 * @returns The filter articles by state.
 */
export function filterArticlesByState(
  articles: Article[],
  articleFilter: ArticleFilter,
  expandedArticleKey: null | string,
  collapsingArticleKeys: string[],
): Article[] {
  const collapsingArticleKeySet = new Set(collapsingArticleKeys);

  return articles.filter((article) => {
    if (articleFilter === "all") {
      return true;
    }

    if (articleFilter === "read") {
      return Boolean(article.isRead);
    }

    if (articleFilter === "starred") {
      return Boolean(article.isStarred);
    }

    const articleKey = getArticleKey(article);
    return (
      !article.isRead ||
      expandedArticleKey === articleKey ||
      collapsingArticleKeySet.has(articleKey)
    );
  });
}

/**
 * Apply the user's preferred chronological order to an article list without
 * trusting the incoming array direction. Server queries own the global window
 * that is fetched for live data, but the visible list can still contain cached,
 * optimistic, placeholder, or restored articles after request failures. Sorting
 * by the article's actual publication timestamp keeps the toolbar state and the
 * rendered order aligned for every feed source.
 * @param articles - The articles to reorder by publication timestamp.
 * @param sortOrder - The desired chronological display order.
 * @returns A copy of the articles in the requested display order.
 */
export function sortArticlesByOrder(
  articles: Article[],
  sortOrder: ArticleSortOrder,
): Article[] {
  return [...articles].sort((leftArticle, rightArticle) =>
    compareArticlesBySortOrder(leftArticle, rightArticle, sortOrder),
  );
}

/**
 * Compare two articles with the same tie-breakers used by the database article
 * window query. Matching the DB contract prevents client-side normalization
 * from reshuffling rows that share an exact publication timestamp.
 * @param leftArticle - The first article in the comparison.
 * @param rightArticle - The second article in the comparison.
 * @param sortOrder - The chronological order requested by the user.
 * @returns A negative number when the left article should render first.
 */
function compareArticlesBySortOrder(
  leftArticle: Article,
  rightArticle: Article,
  sortOrder: ArticleSortOrder,
): number {
  const publicationDateDelta =
    readArticlePublicationTime(leftArticle) -
    readArticlePublicationTime(rightArticle);
  const articleIdDelta = leftArticle.id - rightArticle.id;
  const ascendingDelta = publicationDateDelta || articleIdDelta;

  return sortOrder === "oldest" ? ascendingDelta : -ascendingDelta;
}

/**
 * Read the sortable publication timestamp from an article. API payloads are
 * normalized to `Date` objects, but existing React state can briefly contain
 * serialized timestamps across hot reloads, cache hydration, or error recovery.
 * @param article - The article whose publication timestamp should be read.
 * @returns The finite publication timestamp, or epoch when no valid date exists.
 */
function readArticlePublicationTime(article: Article): number {
  const parsedPublicationDate = parseDateOrNull(
    (article as { publicationDate: unknown }).publicationDate,
  );

  return parsedPublicationDate?.getTime() ?? 0;
}
