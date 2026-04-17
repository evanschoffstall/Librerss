/**
 * Mutable refs that track which article-window limit is already cached and
 * which limit is currently being prefetched in the background.
 */
export interface ArticleWindowPrefetchStateRefs {
  inFlightPrefetchedLimitRef: React.RefObject<number>;
  lastPrefetchedLimitRef: React.RefObject<number>;
}

/**
 * Starts a next-page prefetch only when that limit is neither cached already
 * nor actively being prefetched.
 *
 * The completed-prefetch ref advances only after a successful prefetch so a
 * failed background request never masquerades as a warm cache hit.
 */
export async function prefetchArticleWindowLimitIfNeeded(
  nextLimit: number,
  refs: ArticleWindowPrefetchStateRefs,
  prefetchNextPage: (nextLimit: number) => Promise<void>,
) {
  if (
    refs.lastPrefetchedLimitRef.current >= nextLimit ||
    refs.inFlightPrefetchedLimitRef.current >= nextLimit
  ) {
    return false;
  }

  refs.inFlightPrefetchedLimitRef.current = nextLimit;

  try {
    await prefetchNextPage(nextLimit);
    refs.lastPrefetchedLimitRef.current = Math.max(
      refs.lastPrefetchedLimitRef.current,
      nextLimit,
    );
    return true;
  } finally {
    if (refs.inFlightPrefetchedLimitRef.current === nextLimit) {
      refs.inFlightPrefetchedLimitRef.current = 0;
    }
  }
}

/** Resets both the completed and in-flight prefetch trackers. */
export function resetArticleWindowPrefetchState(
  refs: ArticleWindowPrefetchStateRefs,
) {
  refs.inFlightPrefetchedLimitRef.current = 0;
  refs.lastPrefetchedLimitRef.current = 0;
}
