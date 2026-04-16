import type { InvertedExpansionScrollLockTransitionOptions } from "@/app/dashboard/dashboard-components/feed-view/feed-list-surface-state/useInvertedExpansionScrollLockContracts";

import { useInvertedExpansionScrollLockReadEvents } from "@/app/dashboard/dashboard-components/feed-view/feed-list-surface-state/useInvertedExpansionScrollLockReadEvents";
import { useInvertedExpansionScrollLockTransitionEvents } from "@/app/dashboard/dashboard-components/feed-view/feed-list-surface-state/useInvertedExpansionScrollLockTransitionEvents";

interface UseInvertedExpansionScrollLockEventsOptions extends InvertedExpansionScrollLockTransitionOptions {
  articleFilter: string;
  prepareInvertedUnreadRemovalScrollLock: (
    articleKeys: Iterable<string>,
    options?: { primeInteraction?: boolean },
  ) => void;
}

export function useInvertedExpansionScrollLockEvents({
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
}: UseInvertedExpansionScrollLockEventsOptions) {
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
