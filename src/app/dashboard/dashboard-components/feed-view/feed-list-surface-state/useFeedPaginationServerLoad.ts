"use client";

import { useCallback, useRef } from "react";

import { FEED_SERVER_LOAD_REARM_COOLDOWN_MS } from "@/app/dashboard/dashboard-components/feed-view/feed-list-surface-state/view-core";

interface UseFeedPaginationServerLoadOptions {
  canLoadMoreFromServer: boolean;
  isInvertedLoadBoundaryArmedRef: React.RefObject<boolean>;
  isInvertedScroll: boolean;
  isStandardLoadBoundaryArmedRef: React.RefObject<boolean>;
  onLoadMore?: () => void;
}

export function useFeedPaginationServerLoad({
  canLoadMoreFromServer,
  isInvertedLoadBoundaryArmedRef,
  isInvertedScroll,
  isStandardLoadBoundaryArmedRef,
  onLoadMore,
}: UseFeedPaginationServerLoadOptions) {
  const hasRequestedServerLoadRef = useRef(false);
  const hasPendingServerRevealRef = useRef(false);
  const hasPendingBoundaryRearmAfterCooldownRef = useRef(false);
  const isStandardViewportRefillActiveRef = useRef(false);
  const hasResolvedStandardViewportRevealRef = useRef(false);
  const serverLoadCooldownTimerRef = useRef<null | ReturnType<
    typeof setTimeout
  >>(null);

  const clearServerLoadCooldown = useCallback(() => {
    if (serverLoadCooldownTimerRef.current !== null) {
      clearTimeout(serverLoadCooldownTimerRef.current);
      serverLoadCooldownTimerRef.current = null;
    }
  }, []);

  const startServerLoadRearmCooldown = useCallback(() => {
    clearServerLoadCooldown();
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
    isInvertedLoadBoundaryArmedRef,
    isInvertedScroll,
    isStandardLoadBoundaryArmedRef,
  ]);

  const requestMoreFromServer = useCallback(
    (options?: { isViewportRefill?: boolean }) => {
      if (
        !canLoadMoreFromServer ||
        !onLoadMore ||
        hasRequestedServerLoadRef.current
      ) {
        return false;
      }

      if (!isInvertedScroll) {
        isStandardViewportRefillActiveRef.current =
          options?.isViewportRefill ?? false;
      }

      hasRequestedServerLoadRef.current = true;
      hasPendingServerRevealRef.current = true;
      hasPendingBoundaryRearmAfterCooldownRef.current = false;
      onLoadMore();
      return true;
    },
    [canLoadMoreFromServer, isInvertedScroll, onLoadMore],
  );

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

function completeFeedServerLoadCooldown(options: {
  hasPendingBoundaryRearmAfterCooldownRef: React.RefObject<boolean>;
  hasRequestedServerLoadRef: React.RefObject<boolean>;
  isInvertedLoadBoundaryArmedRef: React.RefObject<boolean>;
  isInvertedScroll: boolean;
  isStandardLoadBoundaryArmedRef: React.RefObject<boolean>;
  serverLoadCooldownTimerRef: React.RefObject<null | ReturnType<typeof setTimeout>>;
}) {
  options.hasRequestedServerLoadRef.current = false;

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
