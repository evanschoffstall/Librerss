"use client";

import { useCallback, useLayoutEffect, useRef } from "react";

const DEFAULT_REFLOW_DURATION_MS = 260;
const DEFAULT_REFLOW_EASING = "cubic-bezier(0.22, 1, 0.36, 1)";

interface UseListReflowAnimationOptions {
  durationMs?: number;
  easing?: string;
}

/**
 * Animates surviving list items into their new vertical positions after a
 * layout-changing insert or removal.
 *
 * The hook uses a lightweight FLIP pass:
 * 1. measure each keyed row before the list change settles,
 * 2. compare the new top position after render,
 * 3. invert the delta on a dedicated motion wrapper,
 * 4. transition that wrapper back to rest.
 */
export function useListReflowAnimation(
  itemKeys: string[],
  {
    durationMs = DEFAULT_REFLOW_DURATION_MS,
    easing = DEFAULT_REFLOW_EASING,
  }: UseListReflowAnimationOptions = {},
) {
  const measureNodesRef = useRef(new Map<string, HTMLDivElement>());
  const motionNodesRef = useRef(new Map<string, HTMLDivElement>());
  const previousTopMapRef = useRef<Map<string, number> | null>(null);
  const rafIdsRef = useRef<number[]>([]);
  const cleanupTimersRef = useRef(new Map<string, number>());

  const clearMotionCleanup = useCallback((key: string) => {
    const timerId = cleanupTimersRef.current.get(key);
    if (timerId === undefined) return;
    window.clearTimeout(timerId);
    cleanupTimersRef.current.delete(key);
  }, []);

  const getMeasureRef = useCallback(
    (key: string) => (node: HTMLDivElement | null) => {
      if (!node) {
        measureNodesRef.current.delete(key);
        return;
      }
      measureNodesRef.current.set(key, node);
    },
    [],
  );

  const getMotionRef = useCallback(
    (key: string) => (node: HTMLDivElement | null) => {
      if (!node) {
        motionNodesRef.current.delete(key);
        clearMotionCleanup(key);
        return;
      }
      motionNodesRef.current.set(key, node);
    },
    [clearMotionCleanup],
  );

  useLayoutEffect(() => {
    const nextTopMap = new Map<string, number>();

    for (const key of itemKeys) {
      const node = measureNodesRef.current.get(key);
      if (!node) continue;
      nextTopMap.set(key, node.getBoundingClientRect().top);
    }

    const previousTopMap = previousTopMapRef.current;
    previousTopMapRef.current = nextTopMap;
    if (!previousTopMap) {
      return;
    }

    for (const key of itemKeys) {
      const previousTop = previousTopMap.get(key);
      const nextTop = nextTopMap.get(key);
      const motionNode = motionNodesRef.current.get(key);
      if (previousTop === undefined || nextTop === undefined || !motionNode) {
        continue;
      }

      const deltaY = previousTop - nextTop;
      if (Math.abs(deltaY) < 1) {
        clearMotionCleanup(key);
        motionNode.style.transition = "";
        motionNode.style.transform = "";
        continue;
      }

      clearMotionCleanup(key);
      motionNode.style.transition = "none";
      motionNode.style.transform = `translateY(${deltaY}px)`;
      void motionNode.getBoundingClientRect();

      rafIdsRef.current.push(
        window.requestAnimationFrame(() => {
          motionNode.style.transition = `transform ${durationMs}ms ${easing}`;
          motionNode.style.transform = "translateY(0)";
          const timerId = window.setTimeout(() => {
            motionNode.style.transition = "";
            motionNode.style.transform = "";
            cleanupTimersRef.current.delete(key);
          }, durationMs);
          cleanupTimersRef.current.set(key, timerId);
        }),
      );
    }

    return () => {
      for (const rafId of rafIdsRef.current) {
        window.cancelAnimationFrame(rafId);
      }
      rafIdsRef.current = [];
    };
  }, [clearMotionCleanup, durationMs, easing, itemKeys]);

  useLayoutEffect(
    () => () => {
      for (const rafId of rafIdsRef.current) {
        window.cancelAnimationFrame(rafId);
      }
      for (const timerId of cleanupTimersRef.current.values()) {
        window.clearTimeout(timerId);
      }
      cleanupTimersRef.current.clear();
    },
    [],
  );

  return { getMeasureRef, getMotionRef };
}
