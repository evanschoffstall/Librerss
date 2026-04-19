import type { Dispatch, SetStateAction } from "react";

import { SKELETON_MIN_VISIBLE_MS } from "@/app/dashboard/dashboard-components/feed-view/feed-list-surface-state/view-core";

export interface HandleFeedPaginationRevealCountTransitionOptions extends SchedulePendingServerRevealCompletionOptions {
  isLoadingMore: boolean;
  previousFilteredFeedLengthRef: { current: number };
}

export interface PendingServerRevealLifecycleOptions {
  hasPendingServerRevealRef: { current: boolean };
  hasResolvedStandardViewportRevealRef: { current: boolean };
  isInvertedScroll: boolean;
  isStandardViewportRefillActiveRef: { current: boolean };
  lastInvertedAwayBoundarySnapshotRef: { current: unknown };
  lastInvertedScrollTopRef: { current: null | number };
  setIsPendingServerRevealVisible: Dispatch<SetStateAction<boolean>>;
  startServerLoadRearmCooldown: () => void;
}

export interface SchedulePendingServerRevealCompletionOptions extends PendingServerRevealLifecycleOptions {
  commitVisibleArticleCount: (nextVisibleCount: number) => void;
  filteredFeedLength: number;
  hasRequestedServerLoadRef: { current: boolean };
  pendingServerRevealCountRef: PendingServerRevealCountRef;
  pendingServerRevealFrameRef: PendingServerRevealFrameRef;
  pendingServerRevealTimeoutRef: PendingServerRevealTimeoutRef;
  visibleArticleCountRef: { current: number };
}

interface PendingServerRevealCountRef {
  current: null | number;
}

interface PendingServerRevealFrameRef {
  current: null | number;
}

interface PendingServerRevealTimeoutRef {
  current: null | ReturnType<typeof setTimeout>;
}

/**
 * Cancel any scheduled server-reveal completion work and clear its tracked count.
 * @param pendingServerRevealCountRef - Stores the filtered-feed length that owns the pending reveal.
 * @param pendingServerRevealFrameRef - Stores the pending animation-frame id.
 * @param pendingServerRevealTimeoutRef - Stores the pending skeleton-minimum timeout id.
 */
export function cancelPendingServerRevealCompletion(
  pendingServerRevealCountRef: PendingServerRevealCountRef,
  pendingServerRevealFrameRef: PendingServerRevealFrameRef,
  pendingServerRevealTimeoutRef: PendingServerRevealTimeoutRef,
) {
  pendingServerRevealCountRef.current = null;

  if (pendingServerRevealFrameRef.current !== null) {
    window.cancelAnimationFrame(pendingServerRevealFrameRef.current);
    pendingServerRevealFrameRef.current = null;
  }

  if (pendingServerRevealTimeoutRef.current !== null) {
    clearTimeout(pendingServerRevealTimeoutRef.current);
    pendingServerRevealTimeoutRef.current = null;
  }
}

/**
 * Finish the active server reveal, release boundary rearming, and reset inverted snapshots.
 * @param options - The refs and callbacks that manage the pending server reveal lifecycle.
 */
export function completePendingServerReveal(
  options: PendingServerRevealLifecycleOptions,
) {
  options.hasPendingServerRevealRef.current = false;
  options.setIsPendingServerRevealVisible(false);

  if (options.isInvertedScroll) {
    options.lastInvertedAwayBoundarySnapshotRef.current = null;
    options.lastInvertedScrollTopRef.current = null;
  }

  options.startServerLoadRearmCooldown();

  if (
    !options.isInvertedScroll &&
    options.isStandardViewportRefillActiveRef.current
  ) {
    options.hasResolvedStandardViewportRevealRef.current = true;
  }
}

/**
 * Apply the current filtered-feed length transition to the server-reveal lifecycle.
 * @param options - The reveal lifecycle state, filtered counts, and commit callbacks for the active update.
 */
export function handleFeedPaginationRevealCountTransition(
  options: HandleFeedPaginationRevealCountTransitionOptions,
) {
  const currentVisibleCount = options.visibleArticleCountRef.current;

  if (shouldCommitViewportRefillReveal(options, currentVisibleCount)) {
    options.commitVisibleArticleCount(
      resolveViewportRefillVisibleCount(
        currentVisibleCount,
        options.filteredFeedLength,
      ),
    );
    options.previousFilteredFeedLengthRef.current = options.filteredFeedLength;
    return;
  }

  const previousFilteredFeedLength =
    options.previousFilteredFeedLengthRef.current;
  options.previousFilteredFeedLengthRef.current = options.filteredFeedLength;
  const hasRevealRequestOwnership = resolveHasRevealRequestOwnership(options);

  if (
    shouldSkipRevealCountTransition(
      options,
      hasRevealRequestOwnership,
      previousFilteredFeedLength,
    )
  ) {
    return;
  }

  if (
    !options.isInvertedScroll &&
    options.isStandardViewportRefillActiveRef.current
  ) {
    completePendingServerReveal(options);

    const refillVisibleCount = resolveViewportRefillVisibleCount(
      currentVisibleCount,
      options.filteredFeedLength,
    );

    if (refillVisibleCount !== currentVisibleCount) {
      options.commitVisibleArticleCount(refillVisibleCount);
    }

    return;
  }

  schedulePendingServerRevealCompletion(options);
}

/**
 * Schedule the pending server reveal to complete after the skeleton has painted for one frame.
 * @param options - The reveal lifecycle state, filtered length, and visible-count commit callback.
 */
export function schedulePendingServerRevealCompletion(
  options: SchedulePendingServerRevealCompletionOptions,
) {
  if (
    options.pendingServerRevealCountRef.current === options.filteredFeedLength
  ) {
    return;
  }

  cancelPendingServerRevealCompletion(
    options.pendingServerRevealCountRef,
    options.pendingServerRevealFrameRef,
    options.pendingServerRevealTimeoutRef,
  );
  options.pendingServerRevealCountRef.current = options.filteredFeedLength;
  options.pendingServerRevealFrameRef.current = window.requestAnimationFrame(
    () => {
      options.pendingServerRevealFrameRef.current = null;
      options.pendingServerRevealTimeoutRef.current = setTimeout(() => {
        options.pendingServerRevealTimeoutRef.current = null;

        if (
          options.pendingServerRevealCountRef.current !==
            options.filteredFeedLength ||
          (!options.hasPendingServerRevealRef.current &&
            !options.hasRequestedServerLoadRef.current)
        ) {
          return;
        }

        options.pendingServerRevealCountRef.current = null;
        completePendingServerReveal(options);

        const refillVisibleCount = resolveViewportRefillVisibleCount(
          options.visibleArticleCountRef.current,
          options.filteredFeedLength,
        );

        if (refillVisibleCount !== options.visibleArticleCountRef.current) {
          options.commitVisibleArticleCount(refillVisibleCount);
        }
      }, SKELETON_MIN_VISIBLE_MS);
    },
  );
}

/**
 * Return whether either a pending reveal or a requested server load still owns the transition.
 * @param options - The active reveal-transition options.
 * @returns Whether the current transition is still owned by server-reveal state.
 */
function resolveHasRevealRequestOwnership(
  options: HandleFeedPaginationRevealCountTransitionOptions,
) {
  return (
    options.hasPendingServerRevealRef.current ||
    options.hasRequestedServerLoadRef.current
  );
}

/**
 * Resolve the visible-count commit for a standard viewport refill.
 * @param currentVisibleCount - The current rendered article count before the refill settles.
 * @param filteredFeedLength - The current unread filtered-feed length.
 * @returns The visible count to commit after clamping to the unread feed length.
 */
function resolveViewportRefillVisibleCount(
  currentVisibleCount: number,
  filteredFeedLength: number,
) {
  return Math.min(currentVisibleCount, filteredFeedLength);
}

/**
 * Return whether the standard viewport refill should reveal immediately while loading continues.
 * @param options - The active reveal-transition options.
 * @param currentVisibleCount - The current rendered article count before applying the transition.
 * @returns Whether the viewport-refill path should commit the new count immediately.
 */
function shouldCommitViewportRefillReveal(
  options: HandleFeedPaginationRevealCountTransitionOptions,
  currentVisibleCount: number,
) {
  return (
    options.isLoadingMore &&
    currentVisibleCount < options.filteredFeedLength &&
    !options.hasPendingServerRevealRef.current &&
    !options.hasRequestedServerLoadRef.current &&
    options.isStandardViewportRefillActiveRef.current
  );
}

/**
 * Return whether the current reveal-count transition should stop before scheduling a reveal.
 * @param options - The active reveal-transition options.
 * @param hasSettledReveal - Whether server-reveal state still owns the transition.
 * @param previousFilteredFeedLength - The previously committed filtered-feed length.
 * @returns Whether no additional reveal work should run for this transition.
 */
function shouldSkipRevealCountTransition(
  options: HandleFeedPaginationRevealCountTransitionOptions,
  hasSettledReveal: boolean,
  previousFilteredFeedLength: number,
) {
  if (options.isLoadingMore && hasSettledReveal) {
    return true;
  }

  return (
    !hasSettledReveal ||
    options.filteredFeedLength <= previousFilteredFeedLength
  );
}
