"use client";

import type { Dispatch, RefObject, SetStateAction } from "react";
import { useEffect, useRef } from "react";

interface UseFeedVisibilityObserverOptions {
  pageSize: number;
  sentinelRef: RefObject<Element | null>;
  setVisibleCount: Dispatch<SetStateAction<number>>;
  totalFeedItems: number;
}

export function useFeedVisibilityObserver({
  pageSize,
  sentinelRef,
  setVisibleCount,
  totalFeedItems,
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

    return () => {
      observer.disconnect();
    };
  }, [pageSize, sentinelRef, setVisibleCount]);
}
