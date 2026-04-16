import { useCallback, useRef, useState } from "react";
import { flushSync } from "react-dom";

import { FEED_MIN_SCROLLABLE_OVERFLOW_PX } from "@/app/dashboard/dashboard-components/feed-view/feed-list-surface-state/view-core";

interface InvertedScrollOwnershipState {
  claimInvertedScrollOwnership: () => void;
  hasClaimedInvertedScrollOwnershipRef: { current: boolean };
  hasUserScrolledRef: { current: boolean };
  resetInvertedScrollOwnership: () => void;
  shouldAnchorUnderfilledInvertedViewport: () => boolean;
}

/**
 * Tracks whether the user has taken ownership of the inverted feed scroll position.
 *
 * Inverted feeds auto-anchor only until the reader intentionally scrolls or an
 * interaction claims ownership. Keeping that bookkeeping isolated keeps the
 * higher-level feed surface hook focused on composition.
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
