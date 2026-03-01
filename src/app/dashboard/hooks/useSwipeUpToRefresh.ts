"use client";

import { useEffect, useRef, useState } from "react";

/** Height of the hidden pull zone above content. */
const SENTINEL_HEIGHT = 104;
/** Distance (px out of sentinel) user must pull to commit. */
const PULL_THRESHOLD = 56;
/** Hold height during refresh feedback. */
const HOLD_PULL_PX = 44;
/** Hold duration before snapping back. */
const REFRESH_HOLD_MS = 650;

interface PullState {
  pulling: boolean;
  readyToRefresh: boolean;
}

const IDLE: PullState = { pulling: false, readyToRefresh: false };

/**
 * Pull-to-refresh using a hidden sentinel div inside the ScrollArea.
 *
 * The sentinel is a real scroll item (SENTINEL_HEIGHT px tall) placed
 * before the feed content. On mount the viewport scrolls past it so it's
 * invisible. Pulling down from the top naturally scrolls into the sentinel
 * zone — 100% native scroll compositor, zero transforms or layout writes.
 *
 * Momentum-only scroll into the sentinel zone is snapped back immediately
 * so pull-to-refresh only triggers with the finger still on screen.
 */
export function useSwipeUpToRefresh(
  scrollRootRef: React.RefObject<HTMLElement | null>,
  onRefresh: () => void,
  disabled = false,
) {
  const [state, setState] = useState<PullState>(IDLE);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const touchActiveRef = useRef(false);
  const committedRef = useRef(false);
  const pullingRef = useRef(false);
  const snapTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const disabledRef = useRef(disabled);
  const onRefreshRef = useRef(onRefresh);
  disabledRef.current = disabled;
  onRefreshRef.current = onRefresh;

  useEffect(() => {
    const root = scrollRootRef.current;
    if (!root) return;

    const viewport =
      root.querySelector<HTMLElement>("[data-radix-scroll-area-viewport]") ??
      root;

    // Hide sentinel on mount + prevent iOS from rubber-banding the page
    viewport.scrollTop = SENTINEL_HEIGHT;
    viewport.style.overscrollBehaviorY = "none";

    const handleScroll = () => {
      const st = viewport.scrollTop;

      // Cap: don't let user scroll above the sentinel top
      if (st < 0) {
        viewport.scrollTop = 0;
        return;
      }

      // In normal content zone — nothing to do
      if (st >= SENTINEL_HEIGHT) {
        if (pullingRef.current) {
          pullingRef.current = false;
          setState(IDLE);
        }
        return;
      }

      const pullDistance = SENTINEL_HEIGHT - st;

      // Finger not on screen — momentum overshoot, snap back smoothly
      if (!touchActiveRef.current) {
        if (!snapTimerRef.current) {
          snapTimerRef.current = setTimeout(() => {
            snapTimerRef.current = undefined;
            if (viewport.scrollTop < SENTINEL_HEIGHT) {
              viewport.scrollTo({ top: SENTINEL_HEIGHT, behavior: "smooth" });
            }
          }, 80);
        }
        if (pullingRef.current) {
          pullingRef.current = false;
          setState(IDLE);
        }
        return;
      }

      const committed = pullDistance >= PULL_THRESHOLD;
      const wasCommitted = committedRef.current;
      committedRef.current = committed;

      // Only setState on actual transitions to avoid per-frame re-renders
      if (!pullingRef.current) {
        pullingRef.current = true;
        setState({ pulling: true, readyToRefresh: committed });
      } else if (committed !== wasCommitted) {
        setState({ pulling: true, readyToRefresh: committed });
      }
    };

    const handleTouchStart = () => {
      touchActiveRef.current = true;
      clearTimeout(snapTimerRef.current);
    };

    const handleTouchEnd = () => {
      touchActiveRef.current = false;
      const st = viewport.scrollTop;

      // Was in normal scroll zone, nothing to do
      if (st >= SENTINEL_HEIGHT) return;

      if (committedRef.current && !disabledRef.current) {
        // Snap to hold position
        viewport.scrollTo({
          top: SENTINEL_HEIGHT - HOLD_PULL_PX,
          behavior: "smooth",
        });
        onRefreshRef.current();
        // After hold, snap back fully
        snapTimerRef.current = setTimeout(() => {
          setState(IDLE);
          viewport.scrollTo({ top: SENTINEL_HEIGHT, behavior: "smooth" });
        }, REFRESH_HOLD_MS);
      } else {
        // Not committed — snap back
        viewport.scrollTo({ top: SENTINEL_HEIGHT, behavior: "smooth" });
        setState(IDLE);
      }
      committedRef.current = false;
    };

    viewport.addEventListener("scroll", handleScroll, { passive: true });
    viewport.addEventListener("touchstart", handleTouchStart, {
      passive: true,
    });
    viewport.addEventListener("touchend", handleTouchEnd);
    viewport.addEventListener("touchcancel", handleTouchEnd);

    return () => {
      clearTimeout(snapTimerRef.current);
      viewport.style.overscrollBehaviorY = "";
      viewport.removeEventListener("scroll", handleScroll);
      viewport.removeEventListener("touchstart", handleTouchStart);
      viewport.removeEventListener("touchend", handleTouchEnd);
      viewport.removeEventListener("touchcancel", handleTouchEnd);
    };
  }, [scrollRootRef]);

  useEffect(() => {
    if (!disabled) return;
    const root = scrollRootRef.current;
    if (!root) return;
    const viewport =
      root.querySelector<HTMLElement>("[data-radix-scroll-area-viewport]") ??
      root;
    viewport.scrollTop = SENTINEL_HEIGHT;
    touchActiveRef.current = false;
    committedRef.current = false;
    pullingRef.current = false;
    clearTimeout(snapTimerRef.current);
    setState(IDLE);
  }, [disabled, scrollRootRef]);

  return {
    pulling: state.pulling,
    readyToRefresh: state.readyToRefresh,
    sentinelRef,
    /** Offset px that scroll-restore must add to account for the sentinel. */
    sentinelHeight: SENTINEL_HEIGHT,
  };
}
