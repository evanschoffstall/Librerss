import type { InvertedExpansionScrollLockTransitionOptions } from "@/app/dashboard/components/feed-view/feed-list-surface-state/useInvertedExpansionScrollLockContracts";

import { useInvertedExpansionScrollLockReadEvents } from "@/app/dashboard/components/feed-view/feed-list-surface-state/useInvertedExpansionScrollLockReadEvents";
import { useInvertedExpansionScrollLockTransitionEvents } from "@/app/dashboard/components/feed-view/feed-list-surface-state/useInvertedExpansionScrollLockTransitionEvents";

/**
 * Describes the options for use inverted expansion scroll lock events.
 */
interface UseInvertedExpansionScrollLockEventsOptions extends InvertedExpansionScrollLockTransitionOptions {
  articleFilter: string;
  prepareInvertedUnreadRemovalScrollLock: (
    articleKeys: Iterable<string>,
    options?: { primeInteraction?: boolean },
  ) => void;
}

/**
 * Manage the inverted expansion scroll lock events.
 * @param options - The options used to manage the inverted expansion scroll lock events.
 */
export function useInvertedExpansionScrollLockEvents(
  options: UseInvertedExpansionScrollLockEventsOptions,
) {
  const {
    articleFilter,
    captureInvertedExpansionViewportSnapshot,
    invertedExpansionScrollLockRef,
    isInvertedScrollRef,
    onClaimInvertedScrollOwnership,
    prepareInvertedUnreadRemovalScrollLock,
    scrollViewport,
    startInvertedExpansionScrollLock,
    syncInvertedExpansionScrollLock,
    viewportSnapshotRef,
  } = options;
  useInvertedExpansionScrollLockReadEvents({
    articleFilter,
    isInvertedScrollRef,
    onClaimInvertedScrollOwnership,
    prepareInvertedUnreadRemovalScrollLock,
    scrollViewport,
  });

  useInvertedExpansionScrollLockTransitionEvents({
    captureInvertedExpansionViewportSnapshot,
    invertedExpansionScrollLockRef,
    isInvertedScrollRef,
    onClaimInvertedScrollOwnership,
    scrollViewport,
    startInvertedExpansionScrollLock,
    syncInvertedExpansionScrollLock,
    viewportSnapshotRef,
  });
}
