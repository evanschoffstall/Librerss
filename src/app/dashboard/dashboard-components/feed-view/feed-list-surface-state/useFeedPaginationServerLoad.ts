"use client";

import { useCallback, useRef } from "react";

import { FEED_SERVER_LOAD_REARM_COOLDOWN_MS } from "@/app/dashboard/dashboard-components/feed-view/feed-list-surface-state/view-core";

interface FeedPaginationServerLoadCooldownStateOptions {
  hasPendingBoundaryRearmAfterCooldownRef: React.RefObject<boolean>;
  hasRequestedServerLoadRef: React.RefObject<boolean>;
  isInvertedLoadBoundaryArmedRef: React.RefObject<boolean>;
  isInvertedScroll: boolean;
  isStandardLoadBoundaryArmedRef: React.RefObject<boolean>;
  serverLoadCooldownTimerRef: React.RefObject<null | ReturnType<
    typeof setTimeout
  >>;
}

interface UseFeedPaginationServerLoadCooldownOptions extends FeedPaginationServerLoadCooldownStateOptions {
  clearServerLoadCooldown: () => void;
}

interface UseFeedPaginationServerLoadOptions {
  canLoadMoreFromServer: boolean;
  isInvertedLoadBoundaryArmedRef: React.RefObject<boolean>;
  isInvertedScroll: boolean;
  isStandardLoadBoundaryArmedRef: React.RefObject<boolean>;
  onLoadMore?: () => void;
}

/**
 * @param root0
 * @param root0.canLoadMoreFromServer
 * @param root0.isInvertedLoadBoundaryArmedRef
 * @param root0.isInvertedScroll
 * @param root0.isStandardLoadBoundaryArmedRef
 * @param root0.onLoadMore
 */
export function useFeedPaginationServerLoad({
  canLoadMoreFromServer,
  isInvertedLoadBoundaryArmedRef,
  isInvertedScroll,
  isStandardLoadBoundaryArmedRef,
  onLoadMore,
}: UseFeedPaginationServerLoadOptions) {
  const {
    hasPendingBoundaryRearmAfterCooldownRef,
    hasPendingServerRevealRef,
    hasRequestedServerLoadRef,
    hasResolvedStandardViewportRevealRef,
    isStandardViewportRefillActiveRef,
    serverLoadCooldownTimerRef,
  } = useFeedPaginationServerLoadRefs();

  const clearServerLoadCooldown = useCallback(() => {
    if (serverLoadCooldownTimerRef.current !== null) {
      clearTimeout(serverLoadCooldownTimerRef.current);
      serverLoadCooldownTimerRef.current = null;
    }
  }, [serverLoadCooldownTimerRef]);

  const startServerLoadRearmCooldown = useFeedPaginationServerLoadCooldown({
    clearServerLoadCooldown,
    hasPendingBoundaryRearmAfterCooldownRef,
    hasRequestedServerLoadRef,
    isInvertedLoadBoundaryArmedRef,
    isInvertedScroll,
    isStandardLoadBoundaryArmedRef,
    serverLoadCooldownTimerRef,
  });

  const requestMoreFromServer = useRequestMoreFromServer({
    canLoadMoreFromServer,
    hasPendingBoundaryRearmAfterCooldownRef,
    hasPendingServerRevealRef,
    hasRequestedServerLoadRef,
    isInvertedScroll,
    isStandardViewportRefillActiveRef,
    onLoadMore,
  });

  return {
    clearServerLoadCooldown,
    hasPendingBoundaryRearmAfterCooldownRef,
    hasPendingServerRevealRef,
    hasRequestedServerLoadRef,
    hasResolvedStandardViewportRevealRef,
    isStandardViewportRefillActiveRef,
    requestMoreFromServer,
    startServerLoadRearmCooldown,
  };
}

/**
 * @param options
 */
function completeFeedServerLoadCooldown(
  options: FeedPaginationServerLoadCooldownStateOptions,
) {
  options.hasRequestedServerLoadRef.current = false;

  if (options.isInvertedScroll) {
    options.isInvertedLoadBoundaryArmedRef.current = true;
  }

  if (options.hasPendingBoundaryRearmAfterCooldownRef.current) {
    rearmFeedLoadBoundary(
      options.isInvertedScroll,
      options.isInvertedLoadBoundaryArmedRef,
      options.isStandardLoadBoundaryArmedRef,
    );
    options.hasPendingBoundaryRearmAfterCooldownRef.current = false;
  }

  options.serverLoadCooldownTimerRef.current = null;
}

/**
 * @param isInvertedScroll
 * @param isInvertedLoadBoundaryArmedRef
 * @param isStandardLoadBoundaryArmedRef
 */
function rearmFeedLoadBoundary(
  isInvertedScroll: boolean,
  isInvertedLoadBoundaryArmedRef: React.RefObject<boolean>,
  isStandardLoadBoundaryArmedRef: React.RefObject<boolean>,
) {
  if (isInvertedScroll) {
    isInvertedLoadBoundaryArmedRef.current = true;
    return;
  }

  isStandardLoadBoundaryArmedRef.current = true;
}

/**
 * @param root0
 * @param root0.clearServerLoadCooldown
 * @param root0.hasPendingBoundaryRearmAfterCooldownRef
 * @param root0.hasRequestedServerLoadRef
 * @param root0.isInvertedLoadBoundaryArmedRef
 * @param root0.isInvertedScroll
 * @param root0.isStandardLoadBoundaryArmedRef
 * @param root0.serverLoadCooldownTimerRef
 */
function useFeedPaginationServerLoadCooldown({
  clearServerLoadCooldown,
  hasPendingBoundaryRearmAfterCooldownRef,
  hasRequestedServerLoadRef,
  isInvertedLoadBoundaryArmedRef,
  isInvertedScroll,
  isStandardLoadBoundaryArmedRef,
  serverLoadCooldownTimerRef,
}: UseFeedPaginationServerLoadCooldownOptions) {
  return useCallback(() => {
    clearServerLoadCooldown();

    if (isInvertedScroll) {
      completeFeedServerLoadCooldown({
        hasPendingBoundaryRearmAfterCooldownRef,
        hasRequestedServerLoadRef,
        isInvertedLoadBoundaryArmedRef,
        isInvertedScroll,
        isStandardLoadBoundaryArmedRef,
        serverLoadCooldownTimerRef,
      });
      return;
    }

    serverLoadCooldownTimerRef.current = setTimeout(() => {
      completeFeedServerLoadCooldown({
        hasPendingBoundaryRearmAfterCooldownRef,
        hasRequestedServerLoadRef,
        isInvertedLoadBoundaryArmedRef,
        isInvertedScroll,
        isStandardLoadBoundaryArmedRef,
        serverLoadCooldownTimerRef,
      });
    }, FEED_SERVER_LOAD_REARM_COOLDOWN_MS);
  }, [
    clearServerLoadCooldown,
    hasPendingBoundaryRearmAfterCooldownRef,
    hasRequestedServerLoadRef,
    isInvertedLoadBoundaryArmedRef,
    isInvertedScroll,
    isStandardLoadBoundaryArmedRef,
    serverLoadCooldownTimerRef,
  ]);
}

/**
 *
 */
function useFeedPaginationServerLoadRefs() {
  return {
    hasPendingBoundaryRearmAfterCooldownRef: useRef(false),
    hasPendingServerRevealRef: useRef(false),
    hasRequestedServerLoadRef: useRef(false),
    hasResolvedStandardViewportRevealRef: useRef(false),
    isStandardViewportRefillActiveRef: useRef(false),
    serverLoadCooldownTimerRef: useRef<null | ReturnType<typeof setTimeout>>(
      null,
    ),
  };
}

/**
 * @param options
 * @param options.canLoadMoreFromServer
 * @param options.hasPendingBoundaryRearmAfterCooldownRef
 * @param options.hasPendingServerRevealRef
 * @param options.hasRequestedServerLoadRef
 * @param options.isInvertedScroll
 * @param options.isStandardViewportRefillActiveRef
 * @param options.onLoadMore
 */
function useRequestMoreFromServer(options: {
  canLoadMoreFromServer: boolean;
  hasPendingBoundaryRearmAfterCooldownRef: React.RefObject<boolean>;
  hasPendingServerRevealRef: React.RefObject<boolean>;
  hasRequestedServerLoadRef: React.RefObject<boolean>;
  isInvertedScroll: boolean;
  isStandardViewportRefillActiveRef: React.RefObject<boolean>;
  onLoadMore?: () => void;
}) {
  return useCallback(
    (requestOptions?: { isViewportRefill?: boolean }) => {
      if (
        !options.canLoadMoreFromServer ||
        !options.onLoadMore ||
        options.hasRequestedServerLoadRef.current
      ) {
        return false;
      }

      if (!options.isInvertedScroll) {
        options.isStandardViewportRefillActiveRef.current =
          requestOptions?.isViewportRefill ?? false;
      }

      options.hasRequestedServerLoadRef.current = true;
      options.hasPendingServerRevealRef.current = true;
      options.hasPendingBoundaryRearmAfterCooldownRef.current = false;
      options.onLoadMore();
      return true;
    },
    [options],
  );
}
