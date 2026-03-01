"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const PULL_THRESHOLD = 56;
const MAX_PULL = 104;
const VERTICAL_LOCK_ANGLE = 45;
const MIN_MOVE_PX = 8;
const REFRESH_HOLD_MS = 650;
const SNAP_BACK_MS = 220;
const HOLD_PULL_PX = 44;

/**
 * Reactive pull-to-refresh that moves the feed content with the finger.
 * Visual updates are direct DOM writes inside rAF.
 */
export function useSwipeUpToRefresh(
  scrollRootRef: React.RefObject<HTMLElement | null>,
  onRefresh: () => void,
  disabled = false,
) {
  const [refreshing, setRefreshing] = useState(false);
  const [pulling, setPulling] = useState(false);
  const [readyToRefresh, setReadyToRefresh] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const lockedRef = useRef<"vertical" | "horizontal" | null>(null);
  const committedRef = useRef(false);
  const pullingRef = useRef(false);
  const rafRef = useRef(0);
  const disabledRef = useRef(disabled);
  const onRefreshRef = useRef(onRefresh);
  disabledRef.current = disabled;
  onRefreshRef.current = onRefresh;

  const applyContentPull = useCallback((distance: number) => {
    const el = contentRef.current;
    if (!el) return;
    el.style.transform = `translate3d(0,${distance}px,0)`;
  }, []);

  const resetContentPull = useCallback((animate: boolean) => {
    const el = contentRef.current;
    if (!el) return;
    if (animate) {
      el.style.transition = `transform ${SNAP_BACK_MS}ms cubic-bezier(.25,.1,.25,1)`;
      el.style.transform = "translate3d(0,0,0)";
      setTimeout(() => {
        el.style.transition = "";
      }, SNAP_BACK_MS);
    } else {
      el.style.transform = "translate3d(0,0,0)";
      el.style.transition = "";
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
      setPulling(false);
      setReadyToRefresh(false);
      const el = contentRef.current;
      if (el) el.style.willChange = "transform, opacity";
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
      setPulling(true);
      pullingRef.current = true;

      const dampened = Math.min(dy * 0.5, MAX_PULL);
      committedRef.current = dampened >= PULL_THRESHOLD;
      setReadyToRefresh(committedRef.current);

      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => applyContentPull(dampened));
    };

    const handleTouchEnd = () => {
      cancelAnimationFrame(rafRef.current);
      const wasPulling = pullingRef.current;
      pullingRef.current = false;
      setPulling(false);
      setReadyToRefresh(false);

      const el = contentRef.current;
      if (el) el.style.willChange = "";

      if (wasPulling && committedRef.current && !disabledRef.current) {
        if (el) {
          el.style.transition = `transform ${SNAP_BACK_MS}ms cubic-bezier(.25,.1,.25,1)`;
          el.style.transform = `translate3d(0,${HOLD_PULL_PX}px,0)`;
          setTimeout(() => {
            if (el) el.style.transition = "";
          }, SNAP_BACK_MS);
        }
        setRefreshing(true);
        onRefreshRef.current();
        setTimeout(() => {
          setRefreshing(false);
          resetContentPull(true);
        }, REFRESH_HOLD_MS);
      } else if (wasPulling) {
        resetContentPull(true);
      }

      startRef.current = null;
      lockedRef.current = null;
      committedRef.current = false;
    };

    viewport.addEventListener("touchstart", handleTouchStart, {
      passive: true,
    });
    viewport.addEventListener("touchmove", handleTouchMove, { passive: false });
    viewport.addEventListener("touchend", handleTouchEnd);
    viewport.addEventListener("touchcancel", handleTouchEnd);

    return () => {
      cancelAnimationFrame(rafRef.current);
      viewport.removeEventListener("touchstart", handleTouchStart);
      viewport.removeEventListener("touchmove", handleTouchMove);
      viewport.removeEventListener("touchend", handleTouchEnd);
      viewport.removeEventListener("touchcancel", handleTouchEnd);
    };
  }, [scrollRootRef, applyContentPull, resetContentPull]);

  useEffect(() => {
    if (!disabled) return;
    resetContentPull(false);
    startRef.current = null;
    lockedRef.current = null;
    pullingRef.current = false;
    committedRef.current = false;
    setPulling(false);
    setReadyToRefresh(false);
  }, [disabled, resetContentPull]);

  return { refreshing, pulling, readyToRefresh, contentRef };
}
