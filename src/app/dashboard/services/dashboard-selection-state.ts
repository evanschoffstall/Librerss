import { type ArticleFilter } from "./article-filters";

interface ShouldResetExpandedArticleOptions {
  articleFilter: ArticleFilter;
  previousArticleFilter: ArticleFilter;
  previousSelectedCategory: string;
  selectedCategory: string;
}

/** Returns whether a dashboard source/filter change should collapse the expanded article. */
export function shouldResetExpandedArticle({
  articleFilter,
  previousArticleFilter,
  previousSelectedCategory,
  selectedCategory,
}: ShouldResetExpandedArticleOptions) {
  return (
    previousSelectedCategory !== selectedCategory ||
    previousArticleFilter !== articleFilter
  );
}