"use client";

import { useAnimationFrame, useReducedMotion } from "motion/react";
import { useEffect, useRef } from "react";

interface UseBackgroundCanvasAnimationOptions {
  onFrame: (now: number, delta: number) => void;
  onResume?: () => void;
}

/**
 * @param root0
 * @param root0.onFrame
 * @param root0.onResume
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
    /**
     *
     */
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

    const delta = lastFrameAtRef.current > 0 ? now - lastFrameAtRef.current : 0;
    lastFrameAtRef.current = now;
    onFrameRef.current(now, delta);
  });
}

/**
 * @param lastFrameAt
 * @param now
 * @param targetFrameMs
 */
function shouldRenderBackgroundCanvasFrame(
  lastFrameAt: number,
  now: number,
  targetFrameMs = 1000 / 30,
) {
  return lastFrameAt === 0 || now - lastFrameAt >= targetFrameMs;
}

/**
 * @param visibilityState
 * @param prefersReducedMotion
 */
function shouldRunBackgroundAnimation(
  visibilityState: DocumentVisibilityState | undefined,
  prefersReducedMotion: boolean,
) {
  return visibilityState !== "hidden" && !prefersReducedMotion;
}
