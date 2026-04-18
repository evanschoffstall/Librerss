interface SyncNormalViewportResetOptions {
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
 * Resolves the owning feed viewport from the mounted surface host node.
 * @param node
 */
export function resolveFeedScrollViewport(node: HTMLDivElement | null) {
  return (
    node?.closest<HTMLElement>(
      "[data-feed-scroll-viewport], [data-radix-scroll-area-viewport]",
    ) ?? null
  );
}

/**
 * Decides whether normal mode should reset and temporarily top-lock the viewport.
 * @param root0
 * @param root0.feedViewKey
 * @param root0.hasResolvedInitialViewport
 * @param root0.isCollapseScrollRestoreActive
 * @param root0.isInvertedScroll
 * @param root0.previousFeedViewKey
 * @param root0.previousIsInvertedScroll
 * @param root0.previousRefreshEpoch
 * @param root0.refreshEpoch
 * @param root0.scrollViewport
 */
export function syncNormalViewportReset({
  feedViewKey,
  hasResolvedInitialViewport,
  isCollapseScrollRestoreActive,
  isInvertedScroll,
  previousFeedViewKey,
  previousIsInvertedScroll,
  previousRefreshEpoch,
  refreshEpoch,
  scrollViewport,
}: SyncNormalViewportResetOptions) {
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
 * @param root0
 * @param root0.feedViewKey
 * @param root0.isInvertedScroll
 * @param root0.previousFeedViewKey
 * @param root0.previousIsInvertedScroll
 * @param root0.previousRefreshEpoch
 * @param root0.refreshEpoch
 */
function didViewportIntentChange({
  feedViewKey,
  isInvertedScroll,
  previousFeedViewKey,
  previousIsInvertedScroll,
  previousRefreshEpoch,
  refreshEpoch,
}: Omit<
  SyncNormalViewportResetOptions,
  | "hasResolvedInitialViewport"
  | "isCollapseScrollRestoreActive"
  | "scrollViewport"
>) {
  return (
    previousFeedViewKey !== feedViewKey ||
    previousRefreshEpoch !== refreshEpoch ||
    previousIsInvertedScroll !== isInvertedScroll
  );
}

/**
 * @param root0
 * @param root0.hasResolvedInitialViewport
 * @param root0.isCollapseScrollRestoreActive
 * @param root0.isInvertedScroll
 * @param root0.scrollViewport
 * @param root0.viewportIntentChanged
 */
function shouldSkipNormalViewportReset({
  hasResolvedInitialViewport,
  isCollapseScrollRestoreActive,
  isInvertedScroll,
  scrollViewport,
  viewportIntentChanged,
}: {
  hasResolvedInitialViewport: boolean;
  isCollapseScrollRestoreActive: boolean;
  isInvertedScroll: boolean;
  scrollViewport: HTMLElement;
  viewportIntentChanged: boolean;
}) {
  const shouldResetInitialViewportScroll =
    !hasResolvedInitialViewport && !isCollapseScrollRestoreActive;
  if (
    isInvertedScroll ||
    (hasResolvedInitialViewport && !viewportIntentChanged)
  ) {
    return true;
  }
  return scrollViewport.scrollTop === 0 && !shouldResetInitialViewportScroll;
}
