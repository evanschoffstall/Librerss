"use client";

import { useEffect, useRef, useState } from "react";

const SWIPE_THRESHOLD = 0.3;
const MIN_SWIPE_PX = 6;
const HORIZONTAL_LOCK_RATIO = 0.45;
const VERTICAL_LOCK_RATIO = 1.35;

export interface SwipeState {
  committed: boolean;
  offsetX: number;
  progress: number;
  swiping: boolean;
}

export const SWIPE_IDLE: SwipeState = {
  committed: false,
  offsetX: 0,
  progress: 0,
  swiping: false,
};

export function useSwipeGesture(
  direction: "left" | "right",
  onCommit: () => void,
  disabled = false,
  shouldIgnoreTarget?: (target: EventTarget | null) => boolean,
) {
  const [state, setState] = useState<SwipeState>(SWIPE_IDLE);
  const containerRef = useRef<HTMLElement>(null);
  const startRef = useRef<null | { x: number; y: number }>(null);
  const lockedRef = useRef<"horizontal" | "vertical" | null>(null);
  const containerWidthRef = useRef(0);
  const committedRef = useRef(false);
  const activePointerIdRef = useRef<null | number>(null);
  const hasCaptureRef = useRef(false);
  const disabledRef = useRef(disabled);
  const onCommitRef = useRef(onCommit);
  disabledRef.current = disabled;
  onCommitRef.current = onCommit;

  const isRight = direction === "right";

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const resetGesture = () => {
      startRef.current = null;
      lockedRef.current = null;
      committedRef.current = false;
      activePointerIdRef.current = null;
      hasCaptureRef.current = false;
      setState(SWIPE_IDLE);
    };

    const releaseCapture = () => {
      const pointerId = activePointerIdRef.current;
      if (pointerId === null || !hasCaptureRef.current) return;
      if (el.hasPointerCapture(pointerId)) el.releasePointerCapture(pointerId);
      hasCaptureRef.current = false;
    };

    const handlePointerDown = (e: PointerEvent) => {
      if (disabledRef.current || e.pointerType === "mouse") return;
      if (shouldIgnoreTarget?.(e.target)) return;
      activePointerIdRef.current = e.pointerId;
      if (!hasCaptureRef.current) {
        el.setPointerCapture(e.pointerId);
        hasCaptureRef.current = true;
      }
      startRef.current = { x: e.clientX, y: e.clientY };
      lockedRef.current = null;
      committedRef.current = false;
      containerWidthRef.current = el.offsetWidth || 300;
    };

    const handlePointerMove = (e: PointerEvent) => {
      if (activePointerIdRef.current !== e.pointerId) return;
      const start = startRef.current;
      if (!start || disabledRef.current) return;
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      const absDx = Math.abs(dx);
      const absDy = Math.abs(dy);

      if (!lockedRef.current) {
        if (absDx < MIN_SWIPE_PX && absDy < MIN_SWIPE_PX) return;

        const hasHorizontalIntent =
          (isRight ? dx > 0 : dx < 0) &&
          absDx >= MIN_SWIPE_PX &&
          absDx >= absDy * HORIZONTAL_LOCK_RATIO;
        if (hasHorizontalIntent) lockedRef.current = "horizontal";
        else if (absDy >= MIN_SWIPE_PX && absDy > absDx * VERTICAL_LOCK_RATIO)
          lockedRef.current = "vertical";
        else return;
      }

      if (lockedRef.current !== "horizontal") return;

      if (e.cancelable) e.preventDefault();

      const clampedDx = isRight ? Math.max(0, dx) : Math.min(0, dx);
      const progress = Math.min(
        Math.abs(clampedDx) / containerWidthRef.current,
        1,
      );
      const committed = progress >= SWIPE_THRESHOLD;
      committedRef.current = committed;
      setState({ committed, offsetX: clampedDx, progress, swiping: true });
    };

    const handlePointerEnd = (e: PointerEvent) => {
      if (activePointerIdRef.current !== e.pointerId) return;
      if (committedRef.current && !disabledRef.current) onCommitRef.current();
      releaseCapture();
      resetGesture();
    };

    const handlePointerCancel = (e: PointerEvent) => {
      if (activePointerIdRef.current !== e.pointerId) return;
      releaseCapture();
      resetGesture();
    };

    const handleLostPointerCapture = () => {
      resetGesture();
    };

    el.addEventListener("pointerdown", handlePointerDown, true);
    el.addEventListener("pointermove", handlePointerMove, {
      capture: true,
      passive: false,
    });
    el.addEventListener("pointerup", handlePointerEnd, true);
    el.addEventListener("pointercancel", handlePointerCancel, true);
    el.addEventListener("lostpointercapture", handleLostPointerCapture);

    return () => {
      releaseCapture();
      el.removeEventListener("pointerdown", handlePointerDown, true);
      el.removeEventListener("pointermove", handlePointerMove, true);
      el.removeEventListener("pointerup", handlePointerEnd, true);
      el.removeEventListener("pointercancel", handlePointerCancel, true);
      el.removeEventListener("lostpointercapture", handleLostPointerCapture);
    };
  }, [isRight, shouldIgnoreTarget]);

  return { containerRef, swipeState: state };
}
