import { useEffect, useRef, useState } from "react";

import { SKELETON_MIN_VISIBLE_MS } from "@/app/dashboard/dashboard-components/feed-view/feed-list-surface-state/view-core";

/**
 * Manage the server load skeleton hold.
 * @param isLoadingMore - Whether is loading more.
 * @returns Whether server load skeleton hold.
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
