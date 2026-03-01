"use client";

import { useEffect, useRef, useState } from "react";

/** Height of the hidden pull zone above content. */
export const SENTINEL_HEIGHT = 104;
/** Tailwind `md:` breakpoint — sentinel is md:hidden. */
const MD_BREAKPOINT = "(min-width: 768px)";
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
  const holdingRef = useRef(false);
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

    /** Live-read sentinel height — handles md:hidden and late layout. */
    const sh = () => sentinelRef.current?.offsetHeight ?? 0;

    const resetPull = () => {
      holdingRef.current = false;
      pullingRef.current = false;
      committedRef.current = false;
      clearTimeout(snapTimerRef.current);
      snapTimerRef.current = undefined;
      setState(IDLE);
    };

    // Hide sentinel on mount + prevent iOS from rubber-banding the page
    viewport.scrollTop = sh();
    viewport.style.overscrollBehaviorY = "none";

    const handleScroll = () => {
      const height = sh();
      if (height === 0) return; // Sentinel hidden (desktop) or not rendered

      const st = viewport.scrollTop;
      if (st < 0) {
        viewport.scrollTop = 0;
        return;
      }

      // In normal content zone — nothing to do
      if (st >= height) {
        if (pullingRef.current && !holdingRef.current) {
          pullingRef.current = false;
          setState(IDLE);
        }
        return;
      }

      // During post-commit hold animation — don't interfere
      if (holdingRef.current) return;

      const pullDistance = height - st;

      // Finger not on screen — momentum overshoot, snap back smoothly
      if (!touchActiveRef.current) {
        if (!snapTimerRef.current) {
          snapTimerRef.current = setTimeout(() => {
            snapTimerRef.current = undefined;
            const h = sh();
            if (h > 0 && viewport.scrollTop < h) {
              viewport.scrollTo({ top: h, behavior: "smooth" });
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
      snapTimerRef.current = undefined;
      // Touch during hold → cancel hold animation, snap back
      if (holdingRef.current) {
        resetPull();
        const h = sh();
        if (h > 0) viewport.scrollTo({ top: h, behavior: "smooth" });
      }
    };

    const handleTouchEnd = () => {
      touchActiveRef.current = false;
      const height = sh();
      const st = viewport.scrollTop;

      // Was in normal scroll zone, nothing to do
      if (st >= height) return;

      if (committedRef.current && !disabledRef.current) {
        // Snap to hold position and trigger refresh
        holdingRef.current = true;
        viewport.scrollTo({
          top: height - HOLD_PULL_PX,
          behavior: "smooth",
        });
        onRefreshRef.current();
        // After hold, snap back fully
        snapTimerRef.current = setTimeout(() => {
          resetPull();
          const h = sh();
          if (h > 0) viewport.scrollTo({ top: h, behavior: "smooth" });
        }, REFRESH_HOLD_MS);
      } else {
        // Not committed — snap back
        pullingRef.current = false;
        viewport.scrollTo({ top: height, behavior: "smooth" });
        setState(IDLE);
      }
      committedRef.current = false;
    };

    // touchcancel = system-initiated cancellation — always snap back, never commit
    const handleTouchCancel = () => {
      touchActiveRef.current = false;
      resetPull();
      const height = sh();
      if (height > 0 && viewport.scrollTop < height) {
        viewport.scrollTo({ top: height, behavior: "smooth" });
      }
    };

    viewport.addEventListener("scroll", handleScroll, { passive: true });
    viewport.addEventListener("touchstart", handleTouchStart, {
      passive: true,
    });
    viewport.addEventListener("touchend", handleTouchEnd);
    viewport.addEventListener("touchcancel", handleTouchCancel);

    return () => {
      clearTimeout(snapTimerRef.current);
      snapTimerRef.current = undefined;
      viewport.style.overscrollBehaviorY = "";
      viewport.removeEventListener("scroll", handleScroll);
      viewport.removeEventListener("touchstart", handleTouchStart);
      viewport.removeEventListener("touchend", handleTouchEnd);
      viewport.removeEventListener("touchcancel", handleTouchCancel);
    };
  }, [scrollRootRef]);

  useEffect(() => {
    if (!disabled) return;
    const root = scrollRootRef.current;
    if (!root) return;
    const viewport =
      root.querySelector<HTMLElement>("[data-radix-scroll-area-viewport]") ??
      root;
    viewport.scrollTop = sentinelRef.current?.offsetHeight ?? 0;
    touchActiveRef.current = false;
    committedRef.current = false;
    pullingRef.current = false;
    holdingRef.current = false;
    clearTimeout(snapTimerRef.current);
    snapTimerRef.current = undefined;
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

/** Scroll-restore offset: SENTINEL_HEIGHT on mobile, 0 on desktop (sentinel is md:hidden). */
export function useSentinelScrollOffset(): number {
  const [offset, setOffset] = useState(SENTINEL_HEIGHT);
  useEffect(() => {
    const mql = window.matchMedia(MD_BREAKPOINT);
    const sync = () => setOffset(mql.matches ? 0 : SENTINEL_HEIGHT);
    sync();
    mql.addEventListener("change", sync);
    return () => mql.removeEventListener("change", sync);
  }, []);
  return offset;
}
