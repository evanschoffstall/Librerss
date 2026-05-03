"use client";

import { useAnimationFrame } from "motion/react";
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
 *
 * The animation loop intentionally runs in every browser regardless of the
 * user's `prefers-reduced-motion` preference. Suspending the loop entirely
 * leaves the canvas blank in browsers (notably Microsoft Edge on Windows
 * with the system "show animations" accessibility setting disabled) where
 * `prefers-reduced-motion: reduce` is reported by default. The dashboard
 * backgrounds are decorative but also form a user-selected visual theme, so
 * the loop stays alive to keep particles visible, dust-like, and responsive
 * to pointer parallax across Chromium, Edge-class Chromium, Firefox, and
 * mobile WebKit environments.
 *
 * The loop is paused only when the document is hidden so background tabs do
 * not waste CPU.
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

  onFrameRef.current = onFrame;
  onResumeRef.current = onResume;

  useEffect(() => {
    /**
     * Synchronize the animation enabled state with the current document
     * visibility, resuming the loop and notifying consumers when the tab
     * becomes visible again so timing references can be re-seeded.
     */
    const syncAnimationState = () => {
      const nextEnabled = document.visibilityState !== "hidden";
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
  }, []);

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
 * Return whether the next animation frame should be rendered, throttling the
 * decorative background to roughly thirty frames per second so its CPU and
 * GPU footprint stays negligible.
 * @param lastFrameAt - The timestamp of the previously rendered frame.
 * @param now - The current animation frame timestamp.
 * @param targetFrameMs - The minimum interval between rendered frames.
 * @returns Whether to render a new frame at the current tick.
 */
function shouldRenderBackgroundCanvasFrame(
  lastFrameAt: number,
  now: number,
  targetFrameMs = 1000 / 30,
) {
  return lastFrameAt === 0 || now - lastFrameAt >= targetFrameMs;
}
