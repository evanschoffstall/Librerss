"use client";

import { useAnimationFrame } from "motion/react";
import { useEffect, useRef } from "react";

/** Listener callbacks registered against document and page lifecycle events. */
interface BackgroundCanvasAnimationListenerOptions {
  lastFrameAtRef: { current: number };
  pauseAnimation: () => void;
  resumeAnimation: () => void;
  syncAnimationState: () => void;
}

/** Mutable ref shape used by the canvas animation lifecycle helpers. */
interface BackgroundCanvasAnimationRefs {
  lastFrameAtRef: { current: number };
  motionEnabledRef: { current: boolean };
  onResumeRef: { current: (() => void) | undefined };
}

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

  useEffect(
    () =>
      registerBackgroundCanvasAnimationLifecycle({
        lastFrameAtRef,
        motionEnabledRef,
        onResumeRef,
      }),
    [],
  );

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
 * Register page lifecycle listeners that keep canvas animation timing bounded.
 * @param refs - Mutable animation refs shared with the render loop.
 * @returns A cleanup callback that removes all registered lifecycle listeners.
 */
function registerBackgroundCanvasAnimationLifecycle(
  refs: BackgroundCanvasAnimationRefs,
) {
  const { lastFrameAtRef, motionEnabledRef, onResumeRef } = refs;
  /** Pause rendering and clear the previous frame timestamp. */
  const pauseAnimation = () => {
    motionEnabledRef.current = false;
    lastFrameAtRef.current = 0;
  };
  /** Resume rendering when the page is visible and notify canvas owners. */
  const resumeAnimation = () => {
    if (document.visibilityState === "hidden") {
      pauseAnimation();
      return;
    }

    const wasEnabled = motionEnabledRef.current;
    motionEnabledRef.current = true;
    lastFrameAtRef.current = 0;

    if (!wasEnabled) {
      onResumeRef.current?.();
    }
  };
  /** Mirror the animation state to the current document visibility. */
  const syncAnimationState = () => {
    if (document.visibilityState === "hidden") {
      pauseAnimation();
      return;
    }

    resumeAnimation();
  };

  return registerBackgroundCanvasAnimationListeners({
    lastFrameAtRef,
    pauseAnimation,
    resumeAnimation,
    syncAnimationState,
  });
}

/**
 * Attach page lifecycle listeners for background canvas animation recovery.
 * @param options - Listener callbacks and frame timestamp ref to clean up.
 * @returns A cleanup callback that removes the listeners and clears timing.
 */
function registerBackgroundCanvasAnimationListeners(
  options: BackgroundCanvasAnimationListenerOptions,
) {
  const {
    lastFrameAtRef,
    pauseAnimation,
    resumeAnimation,
    syncAnimationState,
  } = options;
  syncAnimationState();
  document.addEventListener("visibilitychange", syncAnimationState);
  window.addEventListener("pagehide", pauseAnimation);
  window.addEventListener("pageshow", resumeAnimation);

  return () => {
    lastFrameAtRef.current = 0;
    document.removeEventListener("visibilitychange", syncAnimationState);
    window.removeEventListener("pagehide", pauseAnimation);
    window.removeEventListener("pageshow", resumeAnimation);
  };
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
