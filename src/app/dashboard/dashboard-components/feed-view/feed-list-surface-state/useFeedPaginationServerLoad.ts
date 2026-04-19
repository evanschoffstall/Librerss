"use client";

import { useCallback, useRef, useState } from "react";

import { FEED_SERVER_LOAD_REARM_COOLDOWN_MS } from "@/app/dashboard/dashboard-components/feed-view/feed-list-surface-state/view-core";

interface FeedPaginationServerLoadCooldownStateOptions {
  hasPendingBoundaryRearmAfterCooldownRef: React.RefObject<boolean>;
  hasRequestedServerLoadRef: React.RefObject<boolean>;
  isInvertedLoadBoundaryArmedRef: React.RefObject<boolean>;
  isInvertedScroll: boolean;
  isStandardLoadBoundaryArmedRef: React.RefObject<boolean>;
  maybeLoadNextPageRef: React.RefObject<
    ((_trigger: "scroll" | "sentinel") => void) | null
  >;
  paginationFrameRef: React.RefObject<null | number>;
  serverLoadCooldownTimerRef: React.RefObject<null | ReturnType<
    typeof setTimeout
  >>;
}

interface RequestMoreFromServerOptions {
  canLoadMoreFromServer: boolean;
  hasPendingBoundaryRearmAfterCooldownRef: React.RefObject<boolean>;
  hasPendingServerRevealRef: React.RefObject<boolean>;
  hasRequestedServerLoadRef: React.RefObject<boolean>;
  isInvertedScroll: boolean;
  isStandardViewportRefillActiveRef: React.RefObject<boolean>;
  onLoadMore?: () => void;
  setIsPendingServerRevealVisible: React.Dispatch<
    React.SetStateAction<boolean>
  >;
}

interface UseFeedPaginationServerLoadCooldownOptions extends FeedPaginationServerLoadCooldownStateOptions {
  clearServerLoadCooldown: () => void;
}

interface UseFeedPaginationServerLoadOptions {
  canLoadMoreFromServer: boolean;
  isInvertedLoadBoundaryArmedRef: React.RefObject<boolean>;
  isInvertedScroll: boolean;
  isStandardLoadBoundaryArmedRef: React.RefObject<boolean>;
  maybeLoadNextPageRef: React.RefObject<
    ((_trigger: "scroll" | "sentinel") => void) | null
  >;
  onLoadMore?: () => void;
  paginationFrameRef: React.RefObject<null | number>;
}

/**
 * Process the complete feed server load cooldown.
 * @param options - The options used to process the complete feed server load cooldown.
 */
export function completeFeedServerLoadCooldown(
  options: FeedPaginationServerLoadCooldownStateOptions,
) {
  options.hasRequestedServerLoadRef.current = false;
  rearmFeedLoadBoundary(
    options.isInvertedScroll,
    options.isInvertedLoadBoundaryArmedRef,
    options.isStandardLoadBoundaryArmedRef,
  );
  options.hasPendingBoundaryRearmAfterCooldownRef.current = false;

  if (
    !options.isInvertedScroll &&
    options.paginationFrameRef.current === null &&
    options.maybeLoadNextPageRef.current
  ) {
    options.paginationFrameRef.current = window.requestAnimationFrame(() => {
      options.paginationFrameRef.current = null;
      options.maybeLoadNextPageRef.current?.("sentinel");
    });
  }

  options.serverLoadCooldownTimerRef.current = null;
}

/**
 * Manage the feed pagination server load.
 * @param options - The options used to manage the feed pagination server load.
 * @returns The feed pagination server load state and callbacks.
 */
export function useFeedPaginationServerLoad(
  options: UseFeedPaginationServerLoadOptions,
) {
  const {
    canLoadMoreFromServer,
    isInvertedLoadBoundaryArmedRef,
    isInvertedScroll,
    isStandardLoadBoundaryArmedRef,
    maybeLoadNextPageRef,
    onLoadMore,
    paginationFrameRef,
  } = options;
  const {
    hasPendingBoundaryRearmAfterCooldownRef,
    hasPendingServerRevealRef,
    hasRequestedServerLoadRef,
    hasResolvedStandardViewportRevealRef,
    isStandardViewportRefillActiveRef,
    serverLoadCooldownTimerRef,
  } = useFeedPaginationServerLoadRefs();
  const [isPendingServerRevealVisible, setIsPendingServerRevealVisible] =
    useState(false);

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
    maybeLoadNextPageRef,
    paginationFrameRef,
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
    setIsPendingServerRevealVisible,
  });

  return {
    clearServerLoadCooldown,
    hasPendingBoundaryRearmAfterCooldownRef,
    hasPendingServerRevealRef,
    hasRequestedServerLoadRef,
    hasResolvedStandardViewportRevealRef,
    isPendingServerRevealVisible,
    isStandardViewportRefillActiveRef,
    requestMoreFromServer,
    setIsPendingServerRevealVisible,
    startServerLoadRearmCooldown,
  };
}

/**
 * Process the rearm feed load boundary.
 * @param isInvertedScroll - Whether is inverted scroll.
 * @param isInvertedLoadBoundaryArmedRef - The ref that stores the is inverted load boundary armed ref.
 * @param isStandardLoadBoundaryArmedRef - The ref that stores the is standard load boundary armed ref.
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
 * Manage the feed pagination server load cooldown.
 * @param options - The options used to manage the feed pagination server load cooldown.
 * @returns The feed pagination server load cooldown state and callbacks.
 */
function useFeedPaginationServerLoadCooldown(
  options: UseFeedPaginationServerLoadCooldownOptions,
) {
  const {
    clearServerLoadCooldown,
    hasPendingBoundaryRearmAfterCooldownRef,
    hasRequestedServerLoadRef,
    isInvertedLoadBoundaryArmedRef,
    isInvertedScroll,
    isStandardLoadBoundaryArmedRef,
    maybeLoadNextPageRef,
    paginationFrameRef,
    serverLoadCooldownTimerRef,
  } = options;
  return useCallback(() => {
    clearServerLoadCooldown();

    if (isInvertedScroll) {
      completeFeedServerLoadCooldown({
        hasPendingBoundaryRearmAfterCooldownRef,
        hasRequestedServerLoadRef,
        isInvertedLoadBoundaryArmedRef,
        isInvertedScroll,
        isStandardLoadBoundaryArmedRef,
        maybeLoadNextPageRef,
        paginationFrameRef,
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
        maybeLoadNextPageRef,
        paginationFrameRef,
        serverLoadCooldownTimerRef,
      });
    }, FEED_SERVER_LOAD_REARM_COOLDOWN_MS);
  }, [
    clearServerLoadCooldown,
    hasPendingBoundaryRearmAfterCooldownRef,
    hasRequestedServerLoadRef,
    isInvertedLoadBoundaryArmedRef,
    isInvertedScroll,
    maybeLoadNextPageRef,
    paginationFrameRef,
    isStandardLoadBoundaryArmedRef,
    serverLoadCooldownTimerRef,
  ]);
}
/**
 * Manage the feed pagination server load refs.
 * @returns The feed pagination server load refs state and callbacks.
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
 * Manage the request more from server.
/**
 * Build the `requestMoreFromServer` callback that guards against duplicate requests
 * and orchestrates the server-load lifecycle (pending reveal, boundary re-arm cooldown).
 *
 * Returns `false` when the request is blocked (already in-flight, no server capacity,
 * or no `onLoadMore` handler), and `true` when the request is accepted and dispatched.
 *
 * @param options - Current server-load state, capacity flags, and lifecycle callbacks.
 * @returns Stable `requestMoreFromServer` callback.
 */
function useRequestMoreFromServer(options: RequestMoreFromServerOptions) {
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
      options.setIsPendingServerRevealVisible(
        !(requestOptions?.isViewportRefill ?? false),
      );
      options.onLoadMore();
      return true;
    },
    [options],
  );
}
