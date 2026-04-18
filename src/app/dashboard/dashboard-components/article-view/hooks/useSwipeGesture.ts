"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import {
  createSwipeGestureRuntime,
  SWIPE_IDLE,
  type SwipeGestureContext,
} from "./swipeGestureController";

export {
  SWIPE_COMMIT_SLIDE_MS,
  SWIPE_RELEASE_MS,
} from "./swipeGestureController";
export type { SwipePhase, SwipeState } from "./swipeGestureController";

/**
 * Manage the swipe gesture.
 * @param direction - The direction.
 * @param onCommit - The callback that on commit.
 * @param disabled - The disabled.
 * @param shouldIgnoreTarget - Whether should ignore target.
 * @param reattachKey - The reattach key.
 * @returns The swipe gesture state and callbacks.
 */
export function useSwipeGesture(
  direction: "left" | "right",
  onCommit: () => void,
  disabled = false,
  shouldIgnoreTarget?: (target: EventTarget | null) => boolean,
  reattachKey?: boolean | number | string,
) {
  const [swipeState, setSwipeState] = useState(SWIPE_IDLE);
  const context = useSwipeGestureContext(
    direction,
    onCommit,
    disabled,
    setSwipeState,
    shouldIgnoreTarget,
  );

  useEffect(() => {
    const element = context.containerRef.current;
    if (!element) return;

    const runtime = createSwipeGestureRuntime(element, context);
    runtime.attach();

    return () => {
      runtime.detach();
    };
  }, [context, reattachKey]);

  return { containerRef: context.containerRef, swipeState };
}

/**
 * Manage the swipe gesture context.
 * @param direction - The direction.
 * @param onCommit - The callback that on commit.
 * @param disabled - The disabled.
 * @param setState - The set state.
 * @param shouldIgnoreTarget - Whether should ignore target.
 * @returns The swipe gesture context state and callbacks.
 */
function useSwipeGestureContext(
  direction: "left" | "right",
  onCommit: () => void,
  disabled: boolean,
  setState: SwipeGestureContext["setState"],
  shouldIgnoreTarget?: (target: EventTarget | null) => boolean,
): SwipeGestureContext {
  const activePointerIdRef = useRef<null | number>(null);
  const committedRef = useRef(false);
  const containerRef = useRef<HTMLElement>(null);
  const containerWidthRef = useRef(0);
  const disabledRef = useRef(disabled);
  const hasCaptureRef = useRef(false);
  const lockedRef = useRef<"horizontal" | "vertical" | null>(null);
  const onCommitRef = useRef(onCommit);
  const releaseTimerRef = useRef<null | ReturnType<typeof setTimeout>>(null);
  const startRef = useRef<null | { x: number; y: number }>(null);
  const velocityTrackRef = useRef<{ t: number; x: number }[]>([]);

  const context = useMemo<SwipeGestureContext>(
    () => ({
      activePointerIdRef,
      committedRef,
      containerRef,
      containerWidthRef,
      disabledRef,
      hasCaptureRef,
      isRight: direction === "right",
      lockedRef,
      onCommitRef,
      releaseTimerRef,
      setState,
      shouldIgnoreTarget,
      startRef,
      velocityTrackRef,
    }),
    [direction, setState, shouldIgnoreTarget],
  );

  context.disabledRef.current = disabled;
  context.onCommitRef.current = onCommit;
  return context;
}
