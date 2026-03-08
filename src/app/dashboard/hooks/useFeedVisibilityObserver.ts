"use client";

import type { Dispatch, RefObject, SetStateAction } from "react";
import { useEffect, useRef } from "react";

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
  // Keep a ref so the observer callback always sees the latest value without
  // needing to reconnect the observer whenever totalFeedItems changes.
  const totalRef = useRef(totalFeedItems);
  totalRef.current = totalFeedItems;

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setVisibleCount((previousCount) =>
            Math.min(previousCount + pageSize, totalRef.current),
          );
        }
      },
      { threshold: 0 },
    );

    observer.observe(sentinel);

    return () => observer.disconnect();
  }, [pageSize, sentinelRef, setVisibleCount]);
}
