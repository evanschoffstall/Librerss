import type { Dispatch, SetStateAction } from "react";

import {
  FEED_INVERTED_LOAD_MORE_THRESHOLD_PX,
  SKELETON_MIN_VISIBLE_MS,
} from "@/app/dashboard/dashboard-components/feed-view/feed-list-surface-state/view-core";

/**
 * Describes the options for handle feed pagination reveal count transition.
 */
export interface HandleFeedPaginationRevealCountTransitionOptions extends SchedulePendingServerRevealCompletionOptions {
  isLoadingMore: boolean;
  previousFilteredFeedLengthRef: { current: number };
}

/**
 * Describes the options for pending server reveal lifecycle.
 */
export interface PendingServerRevealLifecycleOptions {
  hasCompletedInvertedServerRevealRef: { current: boolean };
  hasPendingServerRevealRef: { current: boolean };
  hasResolvedStandardViewportRevealRef: { current: boolean };
  isInvertedScroll: boolean;
  isStandardViewportRefillActiveRef: { current: boolean };
  lastInvertedAwayBoundarySnapshotRef: { current: unknown };
  lastInvertedScrollTopRef: { current: null | number };
  setIsPendingServerRevealVisible: Dispatch<SetStateAction<boolean>>;
  startServerLoadRearmCooldown: () => void;
}

/**
 * Describes the options for schedule pending server reveal completion.
 */
export interface SchedulePendingServerRevealCompletionOptions extends PendingServerRevealLifecycleOptions {
  commitVisibleArticleCount: (nextVisibleCount: number) => void;
  filteredFeedLength: number;
  hasRequestedServerLoadRef: { current: boolean };
  pendingServerRevealCountRef: PendingServerRevealCountRef;
  pendingServerRevealFrameRef: PendingServerRevealFrameRef;
  pendingServerRevealTimeoutRef: PendingServerRevealTimeoutRef;
  visibleArticleCountRef: { current: number };
}

/**
 * Describes the pending server reveal count ref.
 */
interface PendingServerRevealCountRef {
  current: null | number;
}

/**
 * Describes the pending server reveal frame ref.
 */
interface PendingServerRevealFrameRef {
  current: null | number;
}

/**
 * Describes the pending server reveal timeout ref.
 */
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
    options.hasCompletedInvertedServerRevealRef.current = true;
    options.lastInvertedAwayBoundarySnapshotRef.current = null;
    // Preserve the recorded scroll position when the user was genuinely away from
    // the boundary during the pending reveal.  Clearing it unconditionally would
    // cause the server-load gate in maybeLoadInvertedNextPage to block a
    // subsequent boundary hit even though the user already demonstrated
    // away-and-back intent (they left to scrollTop > threshold, a reveal fired
    // in the background, and they returned to the boundary).
    // Only reset when the user was at or below the boundary threshold; that
    // covers the "pinned at top the whole time" case that the gate must block.
    const currentScrollTop = options.lastInvertedScrollTopRef.current;
    if (
      currentScrollTop === null ||
      currentScrollTop <= FEED_INVERTED_LOAD_MORE_THRESHOLD_PX
    ) {
      options.lastInvertedScrollTopRef.current = null;
    }
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
    shouldCompleteViewportRefillRevealAfterServerResponse(
      options,
      currentVisibleCount,
      hasRevealRequestOwnership,
    )
  ) {
    completePendingServerReveal(options);
    return;
  }

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

        // The skeleton contract is skeletons first, then the incoming article
        // rows in the same transition. Commit the expanded visible window before
        // the reveal releases ownership so standard scroll cannot briefly render
        // the old article window with no load-more skeleton rows.
        if (
          options.filteredFeedLength > options.visibleArticleCountRef.current
        ) {
          options.commitVisibleArticleCount(options.filteredFeedLength);
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
          }, SKELETON_MIN_VISIBLE_MS);
          return;
        }

        options.pendingServerRevealCountRef.current = null;
        completePendingServerReveal(options);
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
 * Return whether a standard viewport refill already received additional unread
 * articles from the server and can therefore clear its pending reveal even when
 * the overall unread count is still below the previous cycle's total.
 * @param options - The active reveal-transition options.
 * @param currentVisibleCount - The current rendered article count before applying the transition.
 * @param hasRevealRequestOwnership - Whether server-reveal state still owns the transition.
 * @returns Whether the standard viewport refill can finish the pending reveal.
 */
function shouldCompleteViewportRefillRevealAfterServerResponse(
  options: HandleFeedPaginationRevealCountTransitionOptions,
  currentVisibleCount: number,
  hasRevealRequestOwnership: boolean,
) {
  return (
    !options.isLoadingMore &&
    hasRevealRequestOwnership &&
    !options.isInvertedScroll &&
    options.isStandardViewportRefillActiveRef.current &&
    currentVisibleCount < options.filteredFeedLength
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

  if (
    !options.isLoadingMore &&
    hasSettledReveal &&
    options.filteredFeedLength > options.visibleArticleCountRef.current
  ) {
    return false;
  }

  return (
    !hasSettledReveal ||
    options.filteredFeedLength <= previousFilteredFeedLength
  );
}
