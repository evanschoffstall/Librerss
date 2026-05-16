/**
 * Mutable refs that track which article-window limit is already cached and
 * which limit is currently being prefetched in the background.
 */
export interface ArticleWindowPrefetchStateRefs {
  inFlightPrefetchedLimitRef: React.RefObject<number>;
  lastPrefetchedLimitRef: React.RefObject<number>;
}

/**
 * Process the prefetch article window limit if needed.
 * @param nextLimit - The next limit.
 * @param refs - The refs.
 * @param prefetchNextPage - Callback that triggers prefetching of the next article page.
 * @returns The prefetch article window limit if needed.
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

/**
 * Process the reset article window prefetch state.
 * @param refs - The refs.
 */
export function resetArticleWindowPrefetchState(
  refs: ArticleWindowPrefetchStateRefs,
) {
  refs.inFlightPrefetchedLimitRef.current = 0;
  refs.lastPrefetchedLimitRef.current = 0;
}
