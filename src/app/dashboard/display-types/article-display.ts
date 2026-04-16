import type { Article } from "@/lib/core";

export type ArticleRemovalAnimationMode =
  | "collapse"
  | "de-expanding"
  | "swipe-read";

export interface ArticleViewportSnapshot {
  articleBottomOffsetTop: number;
  articleHeaderViewportOffsetTop: number;
  articleKey: string;
  articleViewportOffsetTop: number;
  viewport: HTMLElement;
  viewportScrollTop: number;
}

export type CollapsingArticles = Partial<
  Record<string, CollapsingArticleState>
>;

export interface FeedExtractionSettings {
  extractionDisabled?: boolean;
  proxyEnabled?: boolean;
}

interface CollapsingArticleState {
  article: Article;
  index: number;
  mode: ArticleRemovalAnimationMode;
}

export function getArticleRemovalAnimationDuration(
  mode: ArticleRemovalAnimationMode,
) {
  return mode === "de-expanding" ? 260 : 220;
}
