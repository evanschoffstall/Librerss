import { useLayoutEffect, useRef, useState } from "react";

import { SKELETON_MIN_VISIBLE_MS } from "@/app/dashboard/dashboard-components/feed-view/feed-list-surface-state/view-core";

/**
 * Keep server-pagination skeleton rows visible across fast load completion.
 *
 * The feed can satisfy a pagination request from cache or a very quick network
 * response before React's passive effects run. A layout effect claims the hold
 * before paint so a true-then-false loading transition cannot briefly render the
 * feed with neither articles nor skeletons occupying the incoming page slot.
 * @param isLoadingMore - Whether a server-backed load-more request is active.
 * @returns Whether load-more skeleton rows should remain visible.
 */
export function useServerLoadSkeletonHold(isLoadingMore: boolean): boolean {
  const [isHeld, setIsHeld] = useState(false);
  const holdTimerRef = useRef<null | ReturnType<typeof setTimeout>>(null);

  useLayoutEffect(() => {
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
