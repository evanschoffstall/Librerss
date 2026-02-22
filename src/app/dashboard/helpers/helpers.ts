/**
 * Re-exports from split helper modules.
 * @deprecated Import directly from article-helpers, batch-helpers, or category-helpers.
 */

export {
  buildCategoriesFromSources,
  buildDefaultCategories,
  flattenCategoryFeeds,
  normalizeLabel,
  panelMotion,
  relocateFeedInCategories,
  SYSTEM_ALL_FEEDS_CATEGORY,
  toCategoryKey,
} from "./category-helpers";

export { dedupeAndSortArticles, getArticleKey } from "./article-helpers";

export { mapBatchResultsToArticles } from "./batch-helpers";
export type { FeedBatchSource } from "./batch-helpers";
