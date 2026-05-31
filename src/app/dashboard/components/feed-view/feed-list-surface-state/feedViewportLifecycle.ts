/**
 * Describes the options for should skip normal viewport reset.
 */
interface ShouldSkipNormalViewportResetOptions {
  expandedArticleKey: null | string;
  hasResolvedInitialViewport: boolean;
  isCollapseScrollRestoreActive: boolean;
  isInvertedScroll: boolean;
  scrollViewport: HTMLElement;
  viewportIntentChanged: boolean;
}

/**
 * Describes the options for sync normal viewport reset.
 */
interface SyncNormalViewportResetOptions {
  expandedArticleKey: null | string;
  feedViewKey: string;
  hasResolvedInitialViewport: boolean;
  isCollapseScrollRestoreActive: boolean;
  isInvertedScroll: boolean;
  previousFeedViewKey: string;
  previousIsInvertedScroll: boolean;
  previousRefreshEpoch: number;
  refreshEpoch: number;
  scrollViewport: HTMLElement;
}

/**
 * Resolve the feed scroll viewport.
 * @param node - The node.
 * @returns The feed scroll viewport.
 */
export function resolveFeedScrollViewport(node: HTMLDivElement | null) {
  return (
    node?.closest<HTMLElement>(
      "[data-feed-scroll-viewport], [data-radix-scroll-area-viewport]",
    ) ?? null
  );
}

/**
 * Process the sync normal viewport reset.
 * @param options - The options used to process the sync normal viewport reset.
 * @returns Whether sync normal viewport reset.
 */
export function syncNormalViewportReset(
  options: SyncNormalViewportResetOptions,
) {
  const {
    expandedArticleKey,
    feedViewKey,
    hasResolvedInitialViewport,
    isCollapseScrollRestoreActive,
    isInvertedScroll,
    previousFeedViewKey,
    previousIsInvertedScroll,
    previousRefreshEpoch,
    refreshEpoch,
    scrollViewport,
  } = options;
  const viewportIntentChanged = didViewportIntentChange({
    feedViewKey,
    isInvertedScroll,
    previousFeedViewKey,
    previousIsInvertedScroll,
    previousRefreshEpoch,
    refreshEpoch,
  });
  if (
    isCollapseScrollRestoreActive &&
    hasResolvedInitialViewport &&
    !viewportIntentChanged
  ) {
    return false;
  }
  if (
    shouldSkipNormalViewportReset({
      expandedArticleKey,
      hasResolvedInitialViewport,
      isCollapseScrollRestoreActive,
      isInvertedScroll,
      scrollViewport,
      viewportIntentChanged,
    })
  ) {
    return false;
  }
  scrollViewport.scrollTop = 0;
  return true;
}
/**
 * Process the did viewport intent change.
 * @param options - The options used to process the did viewport intent change.
 * @returns Whether did viewport intent change.
 */
function didViewportIntentChange(
  options: Omit<
    SyncNormalViewportResetOptions,
    | "expandedArticleKey"
    | "hasResolvedInitialViewport"
    | "isCollapseScrollRestoreActive"
    | "scrollViewport"
  >,
) {
  const {
    feedViewKey,
    isInvertedScroll,
    previousFeedViewKey,
    previousIsInvertedScroll,
    previousRefreshEpoch,
    refreshEpoch,
  } = options;
  return (
    previousFeedViewKey !== feedViewKey ||
    previousRefreshEpoch !== refreshEpoch ||
    previousIsInvertedScroll !== isInvertedScroll
  );
}

/**
 * Return whether should skip normal viewport reset.
 * @param options - The options used to return whether should skip normal viewport reset.
 * @returns Whether should skip normal viewport reset.
 */
function shouldSkipNormalViewportReset(
  options: ShouldSkipNormalViewportResetOptions,
) {
  const {
    expandedArticleKey,
    hasResolvedInitialViewport,
    isCollapseScrollRestoreActive,
    isInvertedScroll,
    scrollViewport,
    viewportIntentChanged,
  } = options;
  const shouldResetInitialViewportScroll =
    !hasResolvedInitialViewport && !isCollapseScrollRestoreActive;
  if (
    expandedArticleKey !== null ||
    isInvertedScroll ||
    (hasResolvedInitialViewport && !viewportIntentChanged)
  ) {
    return true;
  }
  return scrollViewport.scrollTop === 0 && !shouldResetInitialViewportScroll;
}
