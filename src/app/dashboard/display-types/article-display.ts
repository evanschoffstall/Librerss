import type { Article } from "@/lib/core";

/**
 * Defines the article removal animation mode type.
 */
export type ArticleRemovalAnimationMode =
  | "collapse"
  | "de-expanding"
  | "swipe-read";

/**
 * Describes the article viewport snapshot.
 */
export interface ArticleViewportSnapshot {
  articleBottomOffsetTop: number;
  articleHeaderViewportOffsetTop: number;
  articleKey: string;
  articleViewportOffsetTop: number;
  viewport: HTMLElement;
  viewportScrollTop: number;
}

/**
 * Defines the collapsing articles type.
 */
export type CollapsingArticles = Partial<
  Record<string, CollapsingArticleState>
>;

/**
 * Describes the feed extraction settings.
 */
export interface FeedExtractionSettings {
  extractionDisabled?: boolean;
  proxyEnabled?: boolean;
}

/**
 * Describes the collapsing article state.
 */
interface CollapsingArticleState {
  article: Article;
  index: number;
  mode: ArticleRemovalAnimationMode;
}

/**
 * Return the article removal animation duration.
 * @param mode - The mode.
 * @returns The article removal animation duration.
 */
export function getArticleRemovalAnimationDuration(
  mode: ArticleRemovalAnimationMode,
) {
  return mode === "de-expanding" ? 260 : 220;
}
