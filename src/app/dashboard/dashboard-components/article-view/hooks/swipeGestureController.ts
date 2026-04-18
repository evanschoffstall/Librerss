import type React from "react";

const SWIPE_THRESHOLD = 0.25;
const MIN_SWIPE_PX = 8;
const HORIZONTAL_LOCK_RATIO = 1.0;
const VERTICAL_LOCK_RATIO = 1.5;
const VELOCITY_MIN_DISTANCE_PX = 30;
const VELOCITY_MIN_PROGRESS = 0.2;
const VELOCITY_COMMIT_PX_PER_MS = 0.45;
const ELASTIC_DAMPING = 0.45;

export const SWIPE_RELEASE_MS = 300;
export const SWIPE_COMMIT_SLIDE_MS = 180;

export interface SwipeGestureContext {
  activePointerIdRef: React.RefObject<null | number>;
  committedRef: React.RefObject<boolean>;
  containerRef: React.RefObject<HTMLElement | null>;
  containerWidthRef: React.RefObject<number>;
  disabledRef: React.RefObject<boolean>;
  hasCaptureRef: React.RefObject<boolean>;
  isRight: boolean;
  lockedRef: React.RefObject<"horizontal" | "vertical" | null>;
  onCommitRef: React.RefObject<() => void>;
  releaseTimerRef: React.RefObject<null | ReturnType<typeof setTimeout>>;
  setState: React.Dispatch<React.SetStateAction<SwipeState>>;
  shouldIgnoreTarget?: (target: EventTarget | null) => boolean;
  startRef: React.RefObject<null | { x: number; y: number }>;
  velocityTrackRef: React.RefObject<{ t: number; x: number }[]>;
}

export type SwipePhase = "committing" | "idle" | "releasing" | "swiping";

export interface SwipeState {
  committed: boolean;
  offsetX: number;
  phase: SwipePhase;
  progress: number;
}

export const SWIPE_IDLE: SwipeState = {
  committed: false,
  offsetX: 0,
  phase: "idle",
  progress: 0,
};

/**
 * Create the swipe gesture runtime.
 * @param element - The element.
 * @param context - The context used to create the swipe gesture runtime.
 * @returns The swipe gesture runtime.
 */
export function createSwipeGestureRuntime(
  element: HTMLElement,
  context: SwipeGestureContext,
) {
  const controls = createSwipeGestureControls(element, context);
  const handlers = createSwipeGestureHandlers(element, context, controls);

  return {
    /**
     * Process the attach.
     */
    attach: () => {
      element.addEventListener("pointerdown", handlers.handlePointerDown, true);
      element.addEventListener("pointermove", handlers.handlePointerMove, {
        capture: true,
        passive: false,
      });
      element.addEventListener("pointerup", handlers.handlePointerEnd, true);
      element.addEventListener(
        "pointercancel",
        handlers.handlePointerCancel,
        true,
      );
      element.addEventListener(
        "lostpointercapture",
        handlers.handleLostPointerCapture,
      );
    },
    /**
     * Process the detach.
     */
    detach: () => {
      controls.clearReleaseTimer();
      controls.releaseCapture();
      controls.restoreTouchAction();
      element.removeEventListener(
        "pointerdown",
        handlers.handlePointerDown,
        true,
      );
      element.removeEventListener(
        "pointermove",
        handlers.handlePointerMove,
        true,
      );
      element.removeEventListener("pointerup", handlers.handlePointerEnd, true);
      element.removeEventListener(
        "pointercancel",
        handlers.handlePointerCancel,
        true,
      );
      element.removeEventListener(
        "lostpointercapture",
        handlers.handleLostPointerCapture,
      );
    },
  };
}

/**
 * Process the apply elastic damping.
 * @param offsetX - The offset x.
 * @returns The apply elastic damping.
 */
function applyElasticDamping(offsetX: number) {
  return offsetX < 0 ? 0 : offsetX * ELASTIC_DAMPING;
}

/**
 * Process the apply swipe pointer move state.
 * @param event - The incoming event.
 * @param context - The context used to process the apply swipe pointer move state.
 */
function applySwipePointerMoveState(
  event: PointerEvent,
  context: SwipeGestureContext,
) {
  const offsetX = resolveSignedSwipeOffsetX(event.clientX, context);
  const width = context.containerWidthRef.current || 1;
  const progress = Math.max(0, Math.min(1, Math.abs(offsetX) / width));
  context.velocityTrackRef.current = [
    ...context.velocityTrackRef.current,
    { t: event.timeStamp, x: event.clientX },
  ].slice(-4);

  context.setState({
    committed: false,
    offsetX,
    phase: "swiping",
    progress,
  });
}

/**
 * Create the committed swipe state.
 * @param isRight - Whether is right.
 * @param width - The width.
 * @returns The committed swipe state.
 */
function createCommittedSwipeState(
  isRight: boolean,
  width: number,
): SwipeState {
  return {
    committed: true,
    offsetX: width * (isRight ? 1 : -1),
    phase: "committing",
    progress: 1,
  };
}

/**
 * Create the swipe gesture controls.
 * @param element - The element.
 * @param context - The context used to create the swipe gesture controls.
 * @returns The swipe gesture controls.
 */
function createSwipeGestureControls(
  element: HTMLElement,
  context: SwipeGestureContext,
) {
  /**
   * Process the clear release timer.
   */
  const clearReleaseTimer = () => {
    if (context.releaseTimerRef.current !== null) {
      clearTimeout(context.releaseTimerRef.current);
      context.releaseTimerRef.current = null;
    }
  };

  /**
   * Process the restore touch action.
   */
  const restoreTouchAction = () => {
    if (element.style.touchAction === "none") {
      element.style.touchAction = "";
    }
  };

  /**
   * Process the release capture.
   */
  const releaseCapture = () => {
    const pointerId = context.activePointerIdRef.current;
    if (pointerId === null || !context.hasCaptureRef.current) return;

    try {
      if (element.hasPointerCapture(pointerId)) {
        element.releasePointerCapture(pointerId);
      }
    } catch {
      // Ignore release failures when the browser has already dropped capture.
    }

    context.hasCaptureRef.current = false;
  };

  /**
   * Process the reset pointer state.
   */
  const resetPointerState = () => {
    restoreTouchAction();
    context.startRef.current = null;
    context.lockedRef.current = null;
    context.committedRef.current = false;
    context.activePointerIdRef.current = null;
    context.hasCaptureRef.current = false;
    context.velocityTrackRef.current = [];
  };

  return {
    /**
     * Process the animate release.
     */
    animateRelease: () => {
      context.setState({
        committed: false,
        offsetX: 0,
        phase: "releasing",
        progress: 0,
      });
      clearReleaseTimer();
      context.releaseTimerRef.current = setTimeout(() => {
        context.setState(SWIPE_IDLE);
        context.releaseTimerRef.current = null;
      }, SWIPE_RELEASE_MS);
    },
    clearReleaseTimer,
    releaseCapture,
    resetPointerState,
    restoreTouchAction,
    /**
     * Process the set touch action none.
     */
    setTouchActionNone: () => {
      element.style.touchAction = "none";
    },
    /**
     * Process the try set pointer capture.
     * @param pointerId - The pointer id.
     */
    trySetPointerCapture: (pointerId: number) => {
      try {
        element.setPointerCapture(pointerId);
        context.hasCaptureRef.current = true;
      } catch {
        context.hasCaptureRef.current = false;
      }
    },
  };
}

/**
 * Create the swipe gesture handlers.
 * @param element - The element.
 * @param context - The context used to create the swipe gesture handlers.
 * @param controls - The callback that controls.
 * @returns The swipe gesture handlers.
 */
function createSwipeGestureHandlers(
  element: HTMLElement,
  context: SwipeGestureContext,
  controls: ReturnType<typeof createSwipeGestureControls>,
) {
  return {
    /**
     * Process the handle lost pointer capture.
     * @param event - The incoming event.
     */
    handleLostPointerCapture: (event: PointerEvent) => {
      if (context.activePointerIdRef.current === null) {
        return;
      }
      if (context.activePointerIdRef.current === event.pointerId) {
        context.hasCaptureRef.current = false;
        return;
      }

      controls.clearReleaseTimer();
      context.setState(SWIPE_IDLE);
      controls.resetPointerState();
    },
    /**
     * Process the handle pointer cancel.
     * @param event - The incoming event.
     */
    handlePointerCancel: (event: PointerEvent) => {
      if (context.activePointerIdRef.current !== event.pointerId) return;
      controls.releaseCapture();
      controls.animateRelease();
      controls.resetPointerState();
    },
    /**
     * Process the handle pointer down.
     * @param event - The incoming event.
     */
    handlePointerDown: (event: PointerEvent) => {
      if (context.disabledRef.current || event.pointerType === "mouse") return;
      if (context.shouldIgnoreTarget?.(event.target)) return;

      controls.clearReleaseTimer();
      context.setState(SWIPE_IDLE);
      context.activePointerIdRef.current = event.pointerId;
      context.startRef.current = { x: event.clientX, y: event.clientY };
      context.lockedRef.current = null;
      context.committedRef.current = false;
      context.containerWidthRef.current = element.offsetWidth || 300;
      context.velocityTrackRef.current = [
        { t: event.timeStamp, x: event.clientX },
      ];
    },
    /**
     * Process the handle pointer end.
     * @param event - The incoming event.
     */
    handlePointerEnd: (event: PointerEvent) => {
      if (context.activePointerIdRef.current !== event.pointerId) return;

      const shouldCommit = resolveShouldCommit(event, context);
      controls.releaseCapture();

      if (shouldCommit && !context.disabledRef.current) {
        context.setState(
          createCommittedSwipeState(
            context.isRight,
            context.containerWidthRef.current,
          ),
        );
        context.onCommitRef.current();
        controls.clearReleaseTimer();
        context.releaseTimerRef.current = setTimeout(() => {
          context.setState(SWIPE_IDLE);
          context.releaseTimerRef.current = null;
        }, SWIPE_COMMIT_SLIDE_MS);
      } else {
        controls.animateRelease();
      }

      controls.resetPointerState();
    },
    /**
     * Process the handle pointer move.
     * @param event - The incoming event.
     */
    handlePointerMove: (event: PointerEvent) => {
      if (context.activePointerIdRef.current !== event.pointerId) return;
      if (!shouldTrackSwipeMove(event, context, controls)) return;
      applySwipePointerMoveState(event, context);
    },
  };
}

/**
 * Resolve the should commit.
 * @param event - The incoming event.
 * @param context - The context used to resolve the should commit.
 * @returns Whether should commit.
 */
function resolveShouldCommit(
  event: PointerEvent,
  context: SwipeGestureContext,
) {
  const offsetX = resolveSignedSwipeOffsetX(event.clientX, context);
  const width = context.containerWidthRef.current || 1;
  if (Math.abs(offsetX) >= width * SWIPE_THRESHOLD) {
    return true;
  }

  const track = context.velocityTrackRef.current;
  if (track.length === 0) {
    return false;
  }

  const first = track[0];
  const last = track[track.length - 1];
  const deltaX = last.x - first.x;
  const elapsed = Math.max(1, last.t - first.t);
  const signedDistance = context.isRight ? deltaX : -deltaX;
  const minimumVelocityDistance = Math.max(
    VELOCITY_MIN_DISTANCE_PX,
    width * VELOCITY_MIN_PROGRESS,
  );
  return (
    signedDistance >= minimumVelocityDistance &&
    signedDistance / elapsed >= VELOCITY_COMMIT_PX_PER_MS
  );
}

/**
 * Resolve the signed swipe offset x.
 * @param clientX - The client x.
 * @param context - The context used to resolve the signed swipe offset x.
 * @returns The signed swipe offset x.
 */
function resolveSignedSwipeOffsetX(
  clientX: number,
  context: SwipeGestureContext,
) {
  const start = context.startRef.current;
  if (!start) {
    return 0;
  }

  const deltaX = clientX - start.x;
  const signedDelta = context.isRight ? deltaX : -deltaX;
  if (signedDelta <= 0) {
    return 0;
  }

  return (context.isRight ? 1 : -1) * applyElasticDamping(signedDelta);
}

/**
 * Return whether should track swipe move.
 * @param event - The incoming event.
 * @param context - The context used to return whether should track swipe move.
 * @param controls - The callback that controls.
 * @returns Whether should track swipe move.
 */
function shouldTrackSwipeMove(
  event: PointerEvent,
  context: SwipeGestureContext,
  controls: ReturnType<typeof createSwipeGestureControls>,
) {
  const start = context.startRef.current;
  if (!start) {
    return false;
  }

  const deltaX = event.clientX - start.x;
  const deltaY = event.clientY - start.y;
  if (context.lockedRef.current === null) {
    const absX = Math.abs(deltaX);
    const absY = Math.abs(deltaY);
    if (absX < MIN_SWIPE_PX && absY < MIN_SWIPE_PX) {
      return false;
    }
    context.lockedRef.current =
      absX >= absY * HORIZONTAL_LOCK_RATIO
        ? "horizontal"
        : absY >= absX * VERTICAL_LOCK_RATIO
          ? "vertical"
          : null;
  }

  if (context.lockedRef.current !== "horizontal") {
    return false;
  }

  if (!context.hasCaptureRef.current) {
    controls.trySetPointerCapture(event.pointerId);
  }
  controls.setTouchActionNone();
  event.preventDefault();
  return true;
}
