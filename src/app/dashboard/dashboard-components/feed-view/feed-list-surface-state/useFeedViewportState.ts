import { useCallback, useLayoutEffect, useRef, useState } from "react";

import {
  resolveFeedScrollViewport,
  syncNormalViewportReset,
} from "@/app/dashboard/dashboard-components/feed-view/feed-list-surface-state/feedViewportLifecycle";
import { type FeedViewportResolutionState } from "@/app/dashboard/dashboard-components/feed-view/feed-list-surface-state/view-core";

/**
 * Describes the options for feed viewport history.
 */
interface FeedViewportHistoryOptions {
  feedViewKey: string;
  hasResolvedInitialViewportRef: React.RefObject<boolean>;
  isInvertedScroll: boolean;
  previousFeedViewKeyRef: React.RefObject<string>;
  previousIsInvertedRef: React.RefObject<boolean>;
  previousRefreshEpochRef: React.RefObject<number>;
  refreshEpoch: number;
}

/**
 * Describes the options for feed viewport host ref.
 */
interface FeedViewportHostRefOptions {
  isMountedRef: React.RefObject<boolean>;
  setScrollViewport: React.Dispatch<React.SetStateAction<HTMLElement | null>>;
  setViewportResolutionState: React.Dispatch<
    React.SetStateAction<FeedViewportResolutionState>
  >;
  viewportResolutionRequestRef: React.RefObject<number>;
}
/**
 * Describes the options for use feed viewport state.
 */
interface UseFeedViewportStateOptions {
  feedViewKey: string;
  isCollapseScrollRestoreActive: boolean;
  isInvertedScroll: boolean;
  refreshEpoch: number;
}

/**
 * Manage the feed viewport state.
 * @param options - The options used to manage the feed viewport state.
 * @returns The feed viewport state state and callbacks.
 */
export function useFeedViewportState(options: UseFeedViewportStateOptions) {
  const {
    feedViewKey,
    isCollapseScrollRestoreActive,
    isInvertedScroll,
    refreshEpoch,
  } = options;
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
/**
 * Update the feed viewport history.
 * @param options - The options used to update the feed viewport history.
 */
function updateFeedViewportHistory(options: FeedViewportHistoryOptions) {
  options.hasResolvedInitialViewportRef.current = true;
  options.previousFeedViewKeyRef.current = options.feedViewKey;
  options.previousRefreshEpochRef.current = options.refreshEpoch;
  options.previousIsInvertedRef.current = options.isInvertedScroll;
}

/**
 * Manage the feed viewport host ref.
 * @param options - The options used to manage the feed viewport host ref.
 * @returns The feed viewport host ref state and callbacks.
 */
function useFeedViewportHostRef(options: FeedViewportHostRefOptions) {
  const {
    isMountedRef,
    setScrollViewport,
    setViewportResolutionState,
    viewportResolutionRequestRef,
  } = options;

  return useCallback(
    (node: HTMLDivElement | null) => {
      viewportResolutionRequestRef.current += 1;
      if (!isMountedRef.current) {
        return;
      }

      const resolvedViewport = resolveFeedScrollViewport(node);
      setScrollViewport((currentViewport) =>
        currentViewport === resolvedViewport
          ? currentViewport
          : resolvedViewport,
      );
      setViewportResolutionState((currentState) =>
        currentState === (resolvedViewport ? "ready" : "missing")
          ? currentState
          : resolvedViewport
            ? "ready"
            : "missing",
      );
    },
    [
      isMountedRef,
      setScrollViewport,
      setViewportResolutionState,
      viewportResolutionRequestRef,
    ],
  );
}

/**
 * Manage the feed viewport mount state.
 * @param isMountedRef - The ref that stores the is mounted ref.
 * @param viewportResolutionRequestRef - The ref that stores the viewport resolution request ref.
 */
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
