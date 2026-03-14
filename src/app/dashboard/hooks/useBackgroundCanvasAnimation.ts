"use client";

import { useEffect, useRef } from "react";

import {
  shouldRenderBackgroundCanvasFrame,
  shouldRunBackgroundAnimation,
} from "../components/background-canvas";

interface UseBackgroundCanvasAnimationOptions {
  /** Draw callback invoked when a scheduled animation frame survives throttling. */
  onFrame: (now: number) => void;
  /** Optional callback invoked when animation resumes after being paused. */
  onResume?: () => void;
}

/**
 * Schedules decorative dashboard canvas animation with pause and throttling.
 *
 * The dashboard's particle and star backgrounds share the same lifecycle rules:
 * pause when the document is hidden, respect reduced-motion preferences, and
 * avoid drawing at full browser refresh rate. Centralizing that logic prevents
 * ornamentation from competing with feed scrolling and article interactions.
 *
 * @param options Draw callback and optional resume hook for the owning canvas.
 */
export function useBackgroundCanvasAnimation({
  onFrame,
  onResume,
}: UseBackgroundCanvasAnimationOptions) {
  const frameRef = useRef<null | number>(null);
  const lastFrameAtRef = useRef(0);
  const motionEnabledRef = useRef(true);

  useEffect(() => {
    const stopAnimation = () => {
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
      }
      frameRef.current = null;
      lastFrameAtRef.current = 0;
    };

    const animate = (now: number) => {
      frameRef.current = null;
      if (!motionEnabledRef.current) {
        return;
      }
      if (!shouldRenderBackgroundCanvasFrame(lastFrameAtRef.current, now)) {
        frameRef.current = requestAnimationFrame(animate);
        return;
      }

      lastFrameAtRef.current = now;
      onFrame(now);
      frameRef.current = requestAnimationFrame(animate);
    };

    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const syncAnimationState = () => {
      const nextEnabled = shouldRunBackgroundAnimation(
        document.visibilityState,
        mediaQuery.matches,
      );
      const wasEnabled = motionEnabledRef.current;
      motionEnabledRef.current = nextEnabled;

      if (!nextEnabled) {
        stopAnimation();
        return;
      }

      if (!wasEnabled) {
        lastFrameAtRef.current = 0;
        onResume?.();
      }

      frameRef.current ??= requestAnimationFrame(animate);
    };

    syncAnimationState();
    document.addEventListener("visibilitychange", syncAnimationState);
    mediaQuery.addEventListener("change", syncAnimationState);

    return () => {
      stopAnimation();
      document.removeEventListener("visibilitychange", syncAnimationState);
      mediaQuery.removeEventListener("change", syncAnimationState);
    };
  }, [onFrame, onResume]);
}
