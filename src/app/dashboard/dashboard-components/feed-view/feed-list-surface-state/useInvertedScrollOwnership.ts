import { useCallback, useRef, useState } from "react";
import { flushSync } from "react-dom";

import { FEED_MIN_SCROLLABLE_OVERFLOW_PX } from "@/app/dashboard/dashboard-components/feed-view/feed-list-surface-state/view-core";

/**
 * Describes the inverted scroll ownership state.
 */
interface InvertedScrollOwnershipState {
  claimInvertedScrollOwnership: () => void;
  hasClaimedInvertedScrollOwnershipRef: { current: boolean };
  hasUserScrolledRef: { current: boolean };
  resetInvertedScrollOwnership: () => void;
  shouldAnchorUnderfilledInvertedViewport: () => boolean;
}

/**
 * Manage the inverted scroll ownership.
 * @param scrollViewport - The scroll viewport.
 * @returns The inverted scroll ownership state and callbacks.
 */
export function useInvertedScrollOwnership(
  scrollViewport: HTMLElement | null,
): InvertedScrollOwnershipState {
  const [, setHasClaimedInvertedScrollOwnership] = useState(false);
  const hasUserScrolledRef = useRef(false);
  const hasClaimedInvertedScrollOwnershipRef = useRef(false);

  const claimInvertedScrollOwnership = useCallback((): void => {
    hasUserScrolledRef.current = true;

    if (hasClaimedInvertedScrollOwnershipRef.current) {
      return;
    }

    hasClaimedInvertedScrollOwnershipRef.current = true;

    flushSync(() => {
      setHasClaimedInvertedScrollOwnership(true);
    });
  }, []);

  const resetInvertedScrollOwnership = useCallback((): void => {
    hasClaimedInvertedScrollOwnershipRef.current = false;
    setHasClaimedInvertedScrollOwnership(false);
  }, []);

  const shouldAnchorUnderfilledInvertedViewport = useCallback(() => {
    if (!scrollViewport) {
      return false;
    }

    let scrollableOverflowPx: number;

    try {
      scrollableOverflowPx =
        scrollViewport.scrollHeight - scrollViewport.clientHeight;
    } catch {
      return false;
    }

    return (
      Number.isFinite(scrollableOverflowPx) &&
      scrollableOverflowPx <= FEED_MIN_SCROLLABLE_OVERFLOW_PX
    );
  }, [scrollViewport]);

  return {
    claimInvertedScrollOwnership,
    hasClaimedInvertedScrollOwnershipRef,
    hasUserScrolledRef,
    resetInvertedScrollOwnership,
    shouldAnchorUnderfilledInvertedViewport,
  };
}
