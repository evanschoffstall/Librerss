"use client";

import { useEffect, useRef, useState } from "react";

const PULL_THRESHOLD = 56;
const MAX_PULL = 104;
const VERTICAL_LOCK_ANGLE = 45;
const MIN_MOVE_PX = 8;
const REFRESH_HOLD_MS = 650;
const SNAP_BACK_MS = 250;
const HOLD_PULL_PX = 44;
const SNAP_EASE = "cubic-bezier(0.2,0,0,1)";

interface PullState {
  pulling: boolean;
  readyToRefresh: boolean;
}

const IDLE: PullState = { pulling: false, readyToRefresh: false };

/** Rubber-band dampening — diminishing resistance like iOS. */
function dampen(dy: number): number {
  const ratio = Math.min(dy / (MAX_PULL * 2.5), 1);
  return MAX_PULL * (1 - (1 - ratio) ** 2.2);
}

/**
 * Pull-to-refresh with 1:1 finger tracking.
 * Mirrors the swipe-to-read pattern: direct inline style writes,
 * `transition: none` during gesture, transition on release.
 */
export function useSwipeUpToRefresh(
  scrollRootRef: React.RefObject<HTMLElement | null>,
  onRefresh: () => void,
  disabled = false,
) {
  const [state, setState] = useState<PullState>(IDLE);
  const contentRef = useRef<HTMLDivElement>(null);
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const lockedRef = useRef<"vertical" | "horizontal" | null>(null);
  const committedRef = useRef(false);
  const pullingRef = useRef(false);
  const disabledRef = useRef(disabled);
  const onRefreshRef = useRef(onRefresh);
  disabledRef.current = disabled;
  onRefreshRef.current = onRefresh;

  // Pre-promote compositor layer once on mount — avoids per-gesture jank
  useEffect(() => {
    const el = contentRef.current;
    if (el) {
      el.style.willChange = "transform";
      el.style.transform = "translate3d(0,0,0)";
    }
  }, []);

  useEffect(() => {
    const root = scrollRootRef.current;
    if (!root) return;

    const viewport =
      root.querySelector<HTMLElement>("[data-radix-scroll-area-viewport]") ??
      root;

    const isAtTop = () => viewport.scrollTop <= 0;

    const handleTouchStart = (e: TouchEvent) => {
      if (disabledRef.current || !isAtTop()) return;
      const t = e.touches[0];
      startRef.current = { x: t.clientX, y: t.clientY };
      lockedRef.current = null;
      committedRef.current = false;
      pullingRef.current = false;
    };

    const handleTouchMove = (e: TouchEvent) => {
      const start = startRef.current;
      if (!start || disabledRef.current) return;

      const t = e.touches[0];
      const dx = t.clientX - start.x;
      const dy = t.clientY - start.y;

      if (!lockedRef.current) {
        if (Math.abs(dx) < MIN_MOVE_PX && Math.abs(dy) < MIN_MOVE_PX) return;
        const angle = Math.abs(Math.atan2(dx, dy) * (180 / Math.PI));
        lockedRef.current =
          angle < VERTICAL_LOCK_ANGLE ? "vertical" : "horizontal";
      }

      if (lockedRef.current !== "vertical" || dy <= 0) return;
      if (!isAtTop()) {
        startRef.current = null;
        return;
      }

      e.preventDefault();

      const dampened = dampen(dy);
      const committed = dampened >= PULL_THRESHOLD;
      const wasCommitted = committedRef.current;
      committedRef.current = committed;

      // Synchronous inline style — transition:none for zero-lag finger tracking
      const el = contentRef.current;
      if (el) {
        el.style.transition = "none";
        el.style.transform = `translate3d(0,${dampened}px,0)`;
      }

      // setState only on transitions, not every frame
      if (!pullingRef.current) {
        pullingRef.current = true;
        setState({ pulling: true, readyToRefresh: committed });
      } else if (committed !== wasCommitted) {
        setState({ pulling: true, readyToRefresh: committed });
      }
    };

    const handleTouchEnd = () => {
      const wasPulling = pullingRef.current;
      const wasCommitted = committedRef.current;
      pullingRef.current = false;
      startRef.current = null;
      lockedRef.current = null;
      committedRef.current = false;

      const el = contentRef.current;

      if (wasPulling && wasCommitted && !disabledRef.current) {
        // Snap to hold position, then refresh, then snap to zero
        if (el) {
          el.style.transition = `transform ${SNAP_BACK_MS}ms ${SNAP_EASE}`;
          el.style.transform = `translate3d(0,${HOLD_PULL_PX}px,0)`;
        }
        onRefreshRef.current();
        setTimeout(() => {
          setState(IDLE);
          if (el) {
            el.style.transition = `transform ${SNAP_BACK_MS}ms ${SNAP_EASE}`;
            el.style.transform = "translate3d(0,0,0)";
          }
        }, REFRESH_HOLD_MS);
      } else if (wasPulling) {
        // Snap back to rest
        if (el) {
          el.style.transition = `transform ${SNAP_BACK_MS}ms ${SNAP_EASE}`;
          el.style.transform = "translate3d(0,0,0)";
        }
        setState(IDLE);
      }
    };

    viewport.addEventListener("touchstart", handleTouchStart, {
      passive: true,
    });
    viewport.addEventListener("touchmove", handleTouchMove, { passive: false });
    viewport.addEventListener("touchend", handleTouchEnd);
    viewport.addEventListener("touchcancel", handleTouchEnd);

    return () => {
      viewport.removeEventListener("touchstart", handleTouchStart);
      viewport.removeEventListener("touchmove", handleTouchMove);
      viewport.removeEventListener("touchend", handleTouchEnd);
      viewport.removeEventListener("touchcancel", handleTouchEnd);
    };
  }, [scrollRootRef]);

  useEffect(() => {
    if (!disabled) return;
    const el = contentRef.current;
    if (el) {
      el.style.transition = "none";
      el.style.transform = "translate3d(0,0,0)";
    }
    startRef.current = null;
    lockedRef.current = null;
    pullingRef.current = false;
    committedRef.current = false;
    setState(IDLE);
  }, [disabled]);

  return {
    pulling: state.pulling,
    readyToRefresh: state.readyToRefresh,
    contentRef,
  };
}
