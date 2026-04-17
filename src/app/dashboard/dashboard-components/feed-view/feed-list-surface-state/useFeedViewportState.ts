import { useCallback, useLayoutEffect, useRef, useState } from "react";

import {
  resolveFeedScrollViewport,
  syncNormalViewportReset,
} from "@/app/dashboard/dashboard-components/feed-view/feed-list-surface-state/feedViewportLifecycle";
import { type FeedViewportResolutionState } from "@/app/dashboard/dashboard-components/feed-view/feed-list-surface-state/view-core";

interface UseFeedViewportStateOptions {
  feedViewKey: string;
  isCollapseScrollRestoreActive: boolean;
  isInvertedScroll: boolean;
  refreshEpoch: number;
}

/**
 * Owns viewport discovery plus the normal-mode top-lock used during feed swaps.
 *
 * The feed surface renders inside the owning scroll viewport, which is resolved
 * after mount. This hook keeps that lookup and the normal-mode initial scroll
 * reset isolated from the higher-level feed state coordinator.
 */
export function useFeedViewportState({
  feedViewKey,
  isCollapseScrollRestoreActive,
  isInvertedScroll,
  refreshEpoch,
}: UseFeedViewportStateOptions) {
  const [scrollViewport, setScrollViewport] = useState<HTMLElement | null>(
    null,
  );
  const [viewportResolutionState, setViewportResolutionState] =
    useState<FeedViewportResolutionState>("pending");
  const viewportResolutionRequestRef = useRef(0);
  const isMountedRef = useRef(true);
  const hasResolvedInitialViewportRef = useRef(false);
  const previousFeedViewKeyRef = useRef(feedViewKey);
  const previousRefreshEpochRef = useRef(refreshEpoch);
  const previousIsInvertedRef = useRef(isInvertedScroll);
  const shouldLockNormalInitialScrollRef = useRef(false);

  useFeedViewportMountState(isMountedRef, viewportResolutionRequestRef);
  const handleViewportHostRef = useFeedViewportHostRef({
    isMountedRef,
    setScrollViewport,
    setViewportResolutionState,
    viewportResolutionRequestRef,
  });

  useLayoutEffect(() => {
    if (!scrollViewport) {
      return;
    }
    shouldLockNormalInitialScrollRef.current = syncNormalViewportReset({
      feedViewKey,
      hasResolvedInitialViewport: hasResolvedInitialViewportRef.current,
      isCollapseScrollRestoreActive,
      isInvertedScroll,
      previousFeedViewKey: previousFeedViewKeyRef.current,
      previousIsInvertedScroll: previousIsInvertedRef.current,
      previousRefreshEpoch: previousRefreshEpochRef.current,
      refreshEpoch,
      scrollViewport,
    });
    updateFeedViewportHistory({
      feedViewKey,
      hasResolvedInitialViewportRef,
      isInvertedScroll,
      previousFeedViewKeyRef,
      previousIsInvertedRef,
      previousRefreshEpochRef,
      refreshEpoch,
    });
  }, [
    feedViewKey,
    isCollapseScrollRestoreActive,
    isInvertedScroll,
    refreshEpoch,
    scrollViewport,
  ]);

  const shouldLockInitialNormalScroll = useCallback(
    () => shouldLockNormalInitialScrollRef.current && !isInvertedScroll,
    [isInvertedScroll],
  );
  const clearInitialNormalScrollLock = useCallback(() => {
    shouldLockNormalInitialScrollRef.current = false;
  }, []);

  return {
    clearInitialNormalScrollLock,
    handleViewportHostRef,
    scrollViewport,
    shouldLockInitialNormalScroll,
    viewportResolutionState,
  };
}

function updateFeedViewportHistory(options: {
  feedViewKey: string;
  hasResolvedInitialViewportRef: React.RefObject<boolean>;
  isInvertedScroll: boolean;
  previousFeedViewKeyRef: React.RefObject<string>;
  previousIsInvertedRef: React.RefObject<boolean>;
  previousRefreshEpochRef: React.RefObject<number>;
  refreshEpoch: number;
}) {
  options.hasResolvedInitialViewportRef.current = true;
  options.previousFeedViewKeyRef.current = options.feedViewKey;
  options.previousRefreshEpochRef.current = options.refreshEpoch;
  options.previousIsInvertedRef.current = options.isInvertedScroll;
}

function useFeedViewportHostRef(options: {
  isMountedRef: React.RefObject<boolean>;
  setScrollViewport: React.Dispatch<React.SetStateAction<HTMLElement | null>>;
  setViewportResolutionState: React.Dispatch<
    React.SetStateAction<FeedViewportResolutionState>
  >;
  viewportResolutionRequestRef: React.RefObject<number>;
}) {
  return useCallback(
    (node: HTMLDivElement | null) => {
      options.viewportResolutionRequestRef.current += 1;
      if (!options.isMountedRef.current) {
        return;
      }

      const resolvedViewport = resolveFeedScrollViewport(node);
      options.setScrollViewport(resolvedViewport);
      options.setViewportResolutionState(
        resolvedViewport ? "ready" : "missing",
      );
    },
    [options],
  );
}

function useFeedViewportMountState(
  isMountedRef: React.RefObject<boolean>,
  viewportResolutionRequestRef: React.RefObject<number>,
) {
  useLayoutEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      viewportResolutionRequestRef.current += 1;
    };
  }, [isMountedRef, viewportResolutionRequestRef]);
}
