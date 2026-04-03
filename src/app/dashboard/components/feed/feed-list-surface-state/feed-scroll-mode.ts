import { type Article } from "@/lib";

export type FeedScrollMode = "inverted" | "standard";

/** Convenience predicate for branches that only care about the inverted mode. */
export function isInvertedFeedScrollMode(scrollMode: FeedScrollMode) {
  return scrollMode === "inverted";
}

/** Resolves whether the current viewport should use the inverted feed mode. */
export function resolveFeedScrollMode(
  isMobile: boolean,
  mobileInvertedScroll: boolean,
): FeedScrollMode {
  return isMobile && mobileInvertedScroll ? "inverted" : "standard";
}

/** Returns the currently visible articles in the order expected by the active scroll mode. */
export function resolveFeedScrollModeArticles(
  visibleArticles: Article[],
  scrollMode: FeedScrollMode,
): Article[] {
  return scrollMode === "inverted" ? [...visibleArticles].reverse() : visibleArticles;
}