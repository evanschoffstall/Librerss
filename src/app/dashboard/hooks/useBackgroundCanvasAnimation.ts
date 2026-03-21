"use client";

import { useAnimationFrame, useReducedMotion } from "motion/react";
import { useEffect, useRef } from "react";

import {
  shouldRenderBackgroundCanvasFrame,
  shouldRunBackgroundAnimation,
} from "../components/background-canvas";

interface UseBackgroundCanvasAnimationOptions {
  /** Draw callback invoked when a scheduled animation frame survives throttling. */
  onFrame: (now: number, delta: number) => void;
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
  const lastFrameAtRef = useRef(0);
  const motionEnabledRef = useRef(true);
  const onFrameRef = useRef(onFrame);
  const onResumeRef = useRef(onResume);
  const prefersReducedMotion = useReducedMotion();

  onFrameRef.current = onFrame;
  onResumeRef.current = onResume;

  useEffect(() => {
    const syncAnimationState = () => {
      const nextEnabled = shouldRunBackgroundAnimation(
        document.visibilityState,
        prefersReducedMotion === true,
      );
      const wasEnabled = motionEnabledRef.current;
      motionEnabledRef.current = nextEnabled;

      if (!nextEnabled) {
        lastFrameAtRef.current = 0;
        return;
      }

      if (!wasEnabled) {
        lastFrameAtRef.current = 0;
        onResumeRef.current?.();
      }
    };

    syncAnimationState();
    document.addEventListener("visibilitychange", syncAnimationState);

    return () => {
      lastFrameAtRef.current = 0;
      document.removeEventListener("visibilitychange", syncAnimationState);
    };
  }, [prefersReducedMotion]);

  useAnimationFrame((now) => {
    if (!motionEnabledRef.current) {
      return;
    }

    if (!shouldRenderBackgroundCanvasFrame(lastFrameAtRef.current, now)) {
      return;
    }

    const delta =
      lastFrameAtRef.current > 0 ? now - lastFrameAtRef.current : 0;
    lastFrameAtRef.current = now;
    onFrameRef.current(now, delta);
  });
}
