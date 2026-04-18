import { useEffect, useRef, useState } from "react";

import { SKELETON_MIN_VISIBLE_MS } from "@/app/dashboard/dashboard-components/feed-view/feed-list-surface-state/view-core";

/**
 * Extends a boolean loading signal so it stays true for at least
 * {@link SKELETON_MIN_VISIBLE_MS} after the source goes false.
 *
 * This prevents load-more skeletons from appearing and vanishing within
 * a single frame when server data resolves instantly from the prefetch cache.
 * @param isLoadingMore
 */
export function useServerLoadSkeletonHold(isLoadingMore: boolean): boolean {
  const [isHeld, setIsHeld] = useState(false);
  const holdTimerRef = useRef<null | ReturnType<typeof setTimeout>>(null);

  useEffect(() => {
    if (isLoadingMore) {
      if (holdTimerRef.current !== null) {
        clearTimeout(holdTimerRef.current);
        holdTimerRef.current = null;
      }
      setIsHeld(true);
      return;
    }

    if (!isHeld) {
      return;
    }

    holdTimerRef.current = setTimeout(() => {
      holdTimerRef.current = null;
      setIsHeld(false);
    }, SKELETON_MIN_VISIBLE_MS);

    return () => {
      if (holdTimerRef.current !== null) {
        clearTimeout(holdTimerRef.current);
        holdTimerRef.current = null;
      }
    };
  }, [isHeld, isLoadingMore]);

  return isLoadingMore || isHeld;
}
