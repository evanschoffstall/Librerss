"use client";

import { useEffect, useRef, useState } from "react";

const SWIPE_THRESHOLD = 0.3;
const VERTICAL_LOCK_ANGLE = 30;
const MIN_SWIPE_PX = 10;

interface SwipeState {
  offsetX: number;
  progress: number;
  swiping: boolean;
  committed: boolean;
}

const IDLE: SwipeState = {
  offsetX: 0,
  progress: 0,
  swiping: false,
  committed: false,
};

export function useSwipeToRead(onMarkRead: () => void, disabled = false) {
  const [state, setState] = useState<SwipeState>(IDLE);
  const containerRef = useRef<HTMLDivElement>(null);
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const lockedRef = useRef<"horizontal" | "vertical" | null>(null);
  const containerWidthRef = useRef(0);
  const committedRef = useRef(false);
  const disabledRef = useRef(disabled);
  const onMarkReadRef = useRef(onMarkRead);
  disabledRef.current = disabled;
  onMarkReadRef.current = onMarkRead;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const handleTouchStart = (e: TouchEvent) => {
      if (disabledRef.current) return;
      const touch = e.touches[0];
      startRef.current = { x: touch.clientX, y: touch.clientY };
      lockedRef.current = null;
      committedRef.current = false;
      containerWidthRef.current = el.offsetWidth || 300;
    };

    const handleTouchMove = (e: TouchEvent) => {
      const start = startRef.current;
      if (!start || disabledRef.current) return;
      const touch = e.touches[0];
      const dx = touch.clientX - start.x;
      const dy = touch.clientY - start.y;

      if (!lockedRef.current) {
        if (Math.abs(dx) < MIN_SWIPE_PX && Math.abs(dy) < MIN_SWIPE_PX) return;
        const angle = Math.abs(Math.atan2(dy, dx) * (180 / Math.PI));
        lockedRef.current =
          angle < VERTICAL_LOCK_ANGLE || angle > 180 - VERTICAL_LOCK_ANGLE
            ? "horizontal"
            : "vertical";
      }

      if (lockedRef.current !== "horizontal") return;

      e.preventDefault();

      const clampedDx = Math.max(0, dx);
      const progress = Math.min(clampedDx / containerWidthRef.current, 1);
      const committed = progress >= SWIPE_THRESHOLD;
      committedRef.current = committed;
      setState({ offsetX: clampedDx, progress, swiping: true, committed });
    };

    const handleTouchEnd = () => {
      if (committedRef.current && !disabledRef.current) onMarkReadRef.current();
      startRef.current = null;
      lockedRef.current = null;
      committedRef.current = false;
      setState(IDLE);
    };

    el.addEventListener("touchstart", handleTouchStart, { passive: true });
    el.addEventListener("touchmove", handleTouchMove, { passive: false });
    el.addEventListener("touchend", handleTouchEnd);

    return () => {
      el.removeEventListener("touchstart", handleTouchStart);
      el.removeEventListener("touchmove", handleTouchMove);
      el.removeEventListener("touchend", handleTouchEnd);
    };
  }, []);

  return { swipeState: state, containerRef };
}
