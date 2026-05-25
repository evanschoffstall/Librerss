import { useEffect } from "react";

import type { InvertedExpansionScrollLockTransitionOptions } from "@/app/dashboard/components/feed-view/feed-list-surface-state/useInvertedExpansionScrollLockContracts";

import { readPreparedArticleKey } from "@/app/dashboard/components/feed-view/feed-list-surface-state/view-core";
import { DASHBOARD_EVENTS } from "@/app/dashboard/services/dashboard-constants";

/**
 * Manage the inverted expansion scroll lock transition events.
 * @param options - The options used to manage the inverted expansion scroll lock transition events.
 */
export function useInvertedExpansionScrollLockTransitionEvents(
  options: InvertedExpansionScrollLockTransitionOptions,
) {
  const {
    captureInvertedExpansionViewportSnapshot,
    invertedExpansionScrollLockRef,
    isInvertedScrollRef,
    onClaimInvertedScrollOwnership,
    scrollViewport,
    startInvertedExpansionScrollLock,
    syncInvertedExpansionScrollLock,
    viewportSnapshotRef,
  } = options;
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
 * Process the bind inverted expansion scroll lock transition events.
 * @param options - The options used to process the bind inverted expansion scroll lock transition events.
 * @returns The bind inverted expansion scroll lock transition events.
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
 * Create the collapse settled handler.
 * @param options - The options used to create the collapse settled handler.
 * @returns The collapse settled handler.
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
 * Create the expand prepared handler.
 * @param options - The options used to create the expand prepared handler.
 * @returns The expand prepared handler.
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
 * Create the expand settled handler.
 * @param options - The options used to create the expand settled handler.
 * @returns The expand settled handler.
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
