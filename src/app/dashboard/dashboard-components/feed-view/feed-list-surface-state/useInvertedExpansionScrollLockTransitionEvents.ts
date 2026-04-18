import { useEffect } from "react";

import type { InvertedExpansionScrollLockTransitionOptions } from "@/app/dashboard/dashboard-components/feed-view/feed-list-surface-state/useInvertedExpansionScrollLockContracts";

import { readPreparedArticleKey } from "@/app/dashboard/dashboard-components/feed-view/feed-list-surface-state/view-core";
import { DASHBOARD_EVENTS } from "@/app/dashboard/dashboard-services/dashboard-constants";

/**
 * @param root0
 * @param root0.captureInvertedExpansionViewportSnapshot
 * @param root0.invertedExpansionScrollLockRef
 * @param root0.isInvertedScrollRef
 * @param root0.onClaimInvertedScrollOwnership
 * @param root0.scrollViewport
 * @param root0.startInvertedExpansionScrollLock
 * @param root0.syncInvertedExpansionScrollLock
 * @param root0.viewportSnapshotRef
 */
export function useInvertedExpansionScrollLockTransitionEvents({
  captureInvertedExpansionViewportSnapshot,
  invertedExpansionScrollLockRef,
  isInvertedScrollRef,
  onClaimInvertedScrollOwnership,
  scrollViewport,
  startInvertedExpansionScrollLock,
  syncInvertedExpansionScrollLock,
  viewportSnapshotRef,
}: InvertedExpansionScrollLockTransitionOptions) {
  useEffect(() => {
    return bindInvertedExpansionScrollLockTransitionEvents({
      captureInvertedExpansionViewportSnapshot,
      invertedExpansionScrollLockRef,
      isInvertedScrollRef,
      onClaimInvertedScrollOwnership,
      scrollViewport,
      startInvertedExpansionScrollLock,
      syncInvertedExpansionScrollLock,
      viewportSnapshotRef,
    });
  }, [
    captureInvertedExpansionViewportSnapshot,
    invertedExpansionScrollLockRef,
    isInvertedScrollRef,
    onClaimInvertedScrollOwnership,
    scrollViewport,
    startInvertedExpansionScrollLock,
    syncInvertedExpansionScrollLock,
    viewportSnapshotRef,
  ]);
}

/**
 * @param options
 */
function bindInvertedExpansionScrollLockTransitionEvents(
  options: InvertedExpansionScrollLockTransitionOptions,
) {
  const scrollViewport = options.scrollViewport;
  if (!scrollViewport) {
    return;
  }

  const handleExpandPrepared = createExpandPreparedHandler(options);
  const handleExpandSettled = createExpandSettledHandler(options);
  const handleCollapseSettled = createCollapseSettledHandler(options);

  scrollViewport.addEventListener(
    DASHBOARD_EVENTS.ARTICLE_EXPAND_PREPARED,
    handleExpandPrepared,
  );
  scrollViewport.addEventListener(
    DASHBOARD_EVENTS.ARTICLE_EXPAND_SETTLED,
    handleExpandSettled,
  );
  scrollViewport.addEventListener(
    DASHBOARD_EVENTS.ARTICLE_COLLAPSE_SETTLED,
    handleCollapseSettled,
  );

  return () => {
    scrollViewport.removeEventListener(
      DASHBOARD_EVENTS.ARTICLE_EXPAND_PREPARED,
      handleExpandPrepared,
    );
    scrollViewport.removeEventListener(
      DASHBOARD_EVENTS.ARTICLE_EXPAND_SETTLED,
      handleExpandSettled,
    );
    scrollViewport.removeEventListener(
      DASHBOARD_EVENTS.ARTICLE_COLLAPSE_SETTLED,
      handleCollapseSettled,
    );
  };
}

/**
 * @param options
 */
function createCollapseSettledHandler(
  options: InvertedExpansionScrollLockTransitionOptions,
) {
  return () => {
    const lockState = options.invertedExpansionScrollLockRef.current as null | {
      mode?: string;
    };
    if (lockState?.mode === "collapsing") {
      lockState.mode = "restore";
    }
    options.syncInvertedExpansionScrollLock();
  };
}

/**
 * @param options
 */
function createExpandPreparedHandler(
  options: InvertedExpansionScrollLockTransitionOptions,
) {
  return (event: Event) => {
    if (!options.isInvertedScrollRef.current) {
      return;
    }

    const articleKey = readPreparedArticleKey(event);
    if (!articleKey) {
      return;
    }

    options.onClaimInvertedScrollOwnership();
    const snapshot =
      options.captureInvertedExpansionViewportSnapshot(articleKey);
    options.viewportSnapshotRef.current = snapshot;
    options.startInvertedExpansionScrollLock(
      articleKey,
      snapshot,
      "expand",
      null,
    );
  };
}

/**
 * @param options
 */
function createExpandSettledHandler(
  options: InvertedExpansionScrollLockTransitionOptions,
) {
  return () => {
    const lockState = options.invertedExpansionScrollLockRef.current as null | {
      mode?: string;
      releaseAt?: null | number;
    };
    if (lockState?.mode === "expand") {
      lockState.mode = "stable";
      lockState.releaseAt = null;
    }
    options.syncInvertedExpansionScrollLock();
  };
}
