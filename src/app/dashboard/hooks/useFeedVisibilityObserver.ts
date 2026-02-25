"use client";

import type { Dispatch, RefObject, SetStateAction } from "react";
import { useEffect } from "react";

interface UseFeedVisibilityObserverOptions {
  sentinelRef: RefObject<Element | null>;
  pageSize: number;
  totalFeedItems: number;
  setVisibleCount: Dispatch<SetStateAction<number>>;
}

export function useFeedVisibilityObserver({
  sentinelRef,
  pageSize,
  totalFeedItems,
  setVisibleCount,
}: UseFeedVisibilityObserverOptions) {
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setVisibleCount((previousCount) =>
            Math.min(previousCount + pageSize, totalFeedItems),
          );
        }
      },
      { threshold: 0 },
    );

    observer.observe(sentinel);

    return () => observer.disconnect();
  }, [pageSize, sentinelRef, setVisibleCount, totalFeedItems]);
}
