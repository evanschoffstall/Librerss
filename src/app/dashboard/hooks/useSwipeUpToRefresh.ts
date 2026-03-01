"use client";

import { useEffect, useRef, useState } from "react";

const PULL_THRESHOLD = 56;
const MAX_PULL = 104;
const VERTICAL_LOCK_ANGLE = 45;
const MIN_MOVE_PX = 8;
const REFRESH_HOLD_MS = 650;
const SNAP_BACK_MS = 220;
const HOLD_PULL_PX = 44;

const EASE_OUT = "cubic-bezier(.25,.1,.25,1)";

interface PullState {
  pulling: boolean;
  readyToRefresh: boolean;
}

const IDLE: PullState = { pulling: false, readyToRefresh: false };

/**
 * Reactive pull-to-refresh that moves the feed content with the finger.
 * All visual updates during the gesture are synchronous direct DOM writes
 * (no rAF, no React state) — matching the swipe-to-read pattern for
 * stutter-free 1:1 finger tracking.
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

  useEffect(() => {
    const root = scrollRootRef.current;
    if (!root) return;

    const viewport =
      root.querySelector<HTMLElement>("[data-radix-scroll-area-viewport]") ??
      root;

    const isAtTop = () => viewport.scrollTop <= 0;

    const setTransform = (el: HTMLElement, y: number) => {
      el.style.transform = `translate3d(0,${y}px,0)`;
    };

    const snapBack = (el: HTMLElement, toY: number, cb?: () => void) => {
      el.style.transition = `transform ${SNAP_BACK_MS}ms ${EASE_OUT}`;
      setTransform(el, toY);
      const onEnd = () => {
        el.style.transition = "";
        el.removeEventListener("transitionend", onEnd);
        cb?.();
      };
      el.addEventListener("transitionend", onEnd, { once: true });
      // Fallback in case transitionend doesn't fire
      setTimeout(onEnd, SNAP_BACK_MS + 50);
    };

    const handleTouchStart = (e: TouchEvent) => {
      if (disabledRef.current || !isAtTop()) return;
      const t = e.touches[0];
      startRef.current = { x: t.clientX, y: t.clientY };
      lockedRef.current = null;
      committedRef.current = false;
      pullingRef.current = false;
      const el = contentRef.current;
      if (el) el.style.willChange = "transform";
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

      const dampened = Math.min(dy * 0.5, MAX_PULL);
      const committed = dampened >= PULL_THRESHOLD;
      const wasCommitted = committedRef.current;
      committedRef.current = committed;

      // Immediate synchronous DOM write — no rAF, no React setState in hot path
      const el = contentRef.current;
      if (el) setTransform(el, dampened);

      // Only call setState on actual state transitions to avoid re-renders
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
      if (el) el.style.willChange = "";

      if (wasPulling && wasCommitted && !disabledRef.current) {
        if (el) {
          snapBack(el, HOLD_PULL_PX, () => {
            onRefreshRef.current();
            setTimeout(() => {
              setState(IDLE);
              if (el) snapBack(el, 0);
            }, REFRESH_HOLD_MS);
          });
        } else {
          onRefreshRef.current();
          setState(IDLE);
        }
      } else if (wasPulling) {
        if (el) snapBack(el, 0);
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
      el.style.transform = "translate3d(0,0,0)";
      el.style.transition = "";
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
