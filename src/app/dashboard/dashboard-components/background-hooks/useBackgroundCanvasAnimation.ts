"use client";

import { useAnimationFrame, useReducedMotion } from "motion/react";
import { useEffect, useRef } from "react";

/**
 * Describes the options for use background canvas animation.
 */
interface UseBackgroundCanvasAnimationOptions {
  onFrame: (now: number, delta: number) => void;
  onResume?: () => void;
}

/**
 * Manage the background canvas animation.
 * @param options - The options used to manage the background canvas animation.
 */
export function useBackgroundCanvasAnimation(
  options: UseBackgroundCanvasAnimationOptions,
) {
  const { onFrame, onResume } = options;
  const lastFrameAtRef = useRef(0);
  const motionEnabledRef = useRef(true);
  const onFrameRef = useRef(onFrame);
  const onResumeRef = useRef(onResume);
  const prefersReducedMotion = useReducedMotion();

  onFrameRef.current = onFrame;
  onResumeRef.current = onResume;

  useEffect(() => {
    /**
     * Process the sync animation state.
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
 * Return whether should render background canvas frame.
 * @param lastFrameAt - The last frame at.
 * @param now - The now.
 * @param targetFrameMs - The target frame ms value.
 * @returns Whether should render background canvas frame.
 */
function shouldRenderBackgroundCanvasFrame(
  lastFrameAt: number,
  now: number,
  targetFrameMs = 1000 / 30,
) {
  return lastFrameAt === 0 || now - lastFrameAt >= targetFrameMs;
}

/**
 * Return whether should run background animation.
 * @param visibilityState - The visibility state.
 * @param prefersReducedMotion - The prefers reduced motion.
 * @returns Whether should run background animation.
 */
function shouldRunBackgroundAnimation(
  visibilityState: DocumentVisibilityState | undefined,
  prefersReducedMotion: boolean,
) {
  return visibilityState !== "hidden" && !prefersReducedMotion;
}
