"use client";

import { useCallback, useRef, useState } from "react";

import { FEED_SERVER_LOAD_REARM_COOLDOWN_MS } from "@/app/dashboard/dashboard-components/feed-view/feed-list-surface-state/view-core";

/**
 * Describes the options for feed pagination server load cooldown state.
 */
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

/**
 * Describes the options for request more from server.
 */
interface RequestMoreFromServerOptions {
  canLoadMoreFromServer: boolean;
  hasPendingBoundaryRearmAfterCooldownRef: React.RefObject<boolean>;
  hasPendingServerRevealRef: React.RefObject<boolean>;
  hasRequestedServerLoadRef: React.RefObject<boolean>;
  isInvertedScroll: boolean;
  isStandardViewportRefillActiveRef: React.RefObject<boolean>;
  /**
   * Starts the owning load-more request.
   *
   * Returning `false` rejects the request claim when the owner discovers a
   * fresher local guard at call time. This keeps pagination from deadlocking in
   * a "requested" state when the UI surface attempted to load more but the
   * dashboard controller intentionally refused to start a network request.
   */
  onLoadMore?: () => unknown;
  setIsPendingServerRevealVisible: React.Dispatch<
    React.SetStateAction<boolean>
  >;
}

/**
 * Describes the options for use feed pagination server load cooldown.
 */
interface UseFeedPaginationServerLoadCooldownOptions extends FeedPaginationServerLoadCooldownStateOptions {
  clearServerLoadCooldown: () => void;
  onCooldownComplete: React.Dispatch<React.SetStateAction<number>>;
}

/**
 * Describes the options for use feed pagination server load.
 */
interface UseFeedPaginationServerLoadOptions {
  canLoadMoreFromServer: boolean;
  isInvertedLoadBoundaryArmedRef: React.RefObject<boolean>;
  isInvertedScroll: boolean;
  isStandardLoadBoundaryArmedRef: React.RefObject<boolean>;
  maybeLoadNextPageRef: React.RefObject<
    ((_trigger: "scroll" | "sentinel") => void) | null
  >;
  onLoadMore?: () => unknown;
  paginationFrameRef: React.RefObject<null | number>;
}

/**
 * Process the complete feed server load cooldown.
 * @param options - The options used to process the complete feed server load cooldown.
 */
export function completeFeedServerLoadCooldown(
  options: FeedPaginationServerLoadCooldownStateOptions,
) {
  const shouldRunPostCooldownPaginationCheck =
    !options.isInvertedScroll ||
    options.hasPendingBoundaryRearmAfterCooldownRef.current;

  options.hasRequestedServerLoadRef.current = false;
  rearmFeedLoadBoundary(
    options.isInvertedScroll,
    options.isInvertedLoadBoundaryArmedRef,
    options.isStandardLoadBoundaryArmedRef,
  );
  options.hasPendingBoundaryRearmAfterCooldownRef.current = false;

  if (
    shouldRunPostCooldownPaginationCheck &&
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
  const refs = useFeedPaginationServerLoadRefs();
  const cooldownState = useServerLoadCooldownState(
    refs.serverLoadCooldownTimerRef,
  );
  const [isPendingServerRevealVisible, setIsPendingServerRevealVisible] =
    useState(false);
  const startServerLoadRearmCooldown = useFeedPaginationServerLoadCooldown({
    clearServerLoadCooldown: cooldownState.clearServerLoadCooldown,
    hasPendingBoundaryRearmAfterCooldownRef:
      refs.hasPendingBoundaryRearmAfterCooldownRef,
    hasRequestedServerLoadRef: refs.hasRequestedServerLoadRef,
    isInvertedLoadBoundaryArmedRef: options.isInvertedLoadBoundaryArmedRef,
    isInvertedScroll: options.isInvertedScroll,
    isStandardLoadBoundaryArmedRef: options.isStandardLoadBoundaryArmedRef,
    maybeLoadNextPageRef: options.maybeLoadNextPageRef,
    onCooldownComplete: cooldownState.setServerLoadCooldownEpoch,
    paginationFrameRef: options.paginationFrameRef,
    serverLoadCooldownTimerRef: refs.serverLoadCooldownTimerRef,
  });
  const requestMoreFromServer = useRequestMoreFromServer({
    canLoadMoreFromServer: options.canLoadMoreFromServer,
    hasPendingBoundaryRearmAfterCooldownRef:
      refs.hasPendingBoundaryRearmAfterCooldownRef,
    hasPendingServerRevealRef: refs.hasPendingServerRevealRef,
    hasRequestedServerLoadRef: refs.hasRequestedServerLoadRef,
    isInvertedScroll: options.isInvertedScroll,
    isStandardViewportRefillActiveRef: refs.isStandardViewportRefillActiveRef,
    onLoadMore: options.onLoadMore,
    setIsPendingServerRevealVisible,
  });
  return {
    clearServerLoadCooldown: cooldownState.clearServerLoadCooldown,
    hasCompletedInvertedServerRevealRef:
      refs.hasCompletedInvertedServerRevealRef,
    hasPendingBoundaryRearmAfterCooldownRef:
      refs.hasPendingBoundaryRearmAfterCooldownRef,
    hasPendingServerRevealRef: refs.hasPendingServerRevealRef,
    hasRequestedServerLoadRef: refs.hasRequestedServerLoadRef,
    hasResolvedStandardViewportRevealRef:
      refs.hasResolvedStandardViewportRevealRef,
    isPendingServerRevealVisible,
    isStandardViewportRefillActiveRef: refs.isStandardViewportRefillActiveRef,
    requestMoreFromServer,
    serverLoadCooldownEpoch: cooldownState.serverLoadCooldownEpoch,
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
 * Build the stable `clearServerLoadCooldown` callback that cancels and forgets
 * any in-flight server-load rearm cooldown timer.
 *
 * Extracted from `useFeedPaginationServerLoad` so the parent hook stays under
 * the lizard NLOC threshold while preserving the original ownership semantics:
 * the timer ref is cleared synchronously and the slot is reset to `null` so the
 * next cooldown can install a fresh timer without leaking the previous handle.
 *
 * @param serverLoadCooldownTimerRef - The mutable ref holding the active cooldown timer.
 * @returns A stable callback that clears the cooldown timer when invoked.
 */
function useClearServerLoadCooldown(
  serverLoadCooldownTimerRef: React.RefObject<null | ReturnType<
    typeof setTimeout
  >>,
): () => void {
  return useCallback(() => {
    if (serverLoadCooldownTimerRef.current !== null) {
      clearTimeout(serverLoadCooldownTimerRef.current);
      serverLoadCooldownTimerRef.current = null;
    }
  }, [serverLoadCooldownTimerRef]);
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
    onCooldownComplete,
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
      onCooldownComplete((prev) => prev + 1);
    }, FEED_SERVER_LOAD_REARM_COOLDOWN_MS);
  }, [
    clearServerLoadCooldown,
    hasPendingBoundaryRearmAfterCooldownRef,
    hasRequestedServerLoadRef,
    isInvertedLoadBoundaryArmedRef,
    isInvertedScroll,
    maybeLoadNextPageRef,
    onCooldownComplete,
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
    hasCompletedInvertedServerRevealRef: useRef(false),
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

      const didAcceptLoadRequest = options.onLoadMore() !== false;

      if (!didAcceptLoadRequest) {
        if (!options.isInvertedScroll) {
          options.isStandardViewportRefillActiveRef.current = false;
        }

        return false;
      }

      options.hasRequestedServerLoadRef.current = true;
      options.hasPendingServerRevealRef.current = true;
      options.hasPendingBoundaryRearmAfterCooldownRef.current = false;
      options.setIsPendingServerRevealVisible(
        !(requestOptions?.isViewportRefill ?? false),
      );
      return true;
    },
    [options],
  );
}

/**
 * Bundle the cooldown timer state, epoch counter, and clear callback into a
 * single helper so `useFeedPaginationServerLoad` stays under the lizard NLOC
 * threshold without losing the ownership semantics of the cooldown lifecycle.
 *
 * The epoch counter is bumped every time the cooldown timer elapses, allowing
 * downstream effects (e.g., the post-cooldown auto-fill re-trigger) to react
 * without subscribing to the timer ref directly.
 *
 * @param serverLoadCooldownTimerRef - The mutable ref holding the active cooldown timer.
 * @returns The bundled cooldown lifecycle state.
 */
function useServerLoadCooldownState(
  serverLoadCooldownTimerRef: React.RefObject<null | ReturnType<
    typeof setTimeout
  >>,
) {
  const [serverLoadCooldownEpoch, setServerLoadCooldownEpoch] = useState(0);
  const clearServerLoadCooldown = useClearServerLoadCooldown(
    serverLoadCooldownTimerRef,
  );
  return {
    clearServerLoadCooldown,
    serverLoadCooldownEpoch,
    setServerLoadCooldownEpoch,
  };
}
