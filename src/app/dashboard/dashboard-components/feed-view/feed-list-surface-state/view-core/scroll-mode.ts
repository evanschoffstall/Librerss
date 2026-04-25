import type { Article } from "@/lib/core";

export type FeedScrollMode = "inverted" | "standard";

/**
 * Return whether is inverted feed scroll mode.
 * @param scrollMode - The scroll mode.
 * @returns Whether is inverted feed scroll mode.
 */
export function isInvertedFeedScrollMode(scrollMode: FeedScrollMode) {
  return scrollMode === "inverted";
}

/**
 * Resolve the feed scroll mode.
 * @param isMobile - Whether is mobile.
 * @param mobileInvertedScroll - The mobile inverted scroll.
 * @returns The feed scroll mode.
 */
export function resolveFeedScrollMode(
  isMobile: boolean,
  mobileInvertedScroll: boolean,
): FeedScrollMode {
  return isMobile && mobileInvertedScroll ? "inverted" : "standard";
}

/**
 * Resolve the feed scroll mode articles.
 * @param visibleArticles - The visible articles.
 * @param scrollMode - The scroll mode.
 * @returns The feed scroll mode articles.
 */
export function resolveFeedScrollModeArticles(
  visibleArticles: Article[],
  scrollMode: FeedScrollMode,
): Article[] {
  return scrollMode === "inverted"
    ? [...visibleArticles].reverse()
    : visibleArticles;
}
