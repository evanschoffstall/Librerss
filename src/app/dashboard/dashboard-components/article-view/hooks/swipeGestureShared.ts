import type React from "react";

/**
 * The fraction of the container width the user must drag before the swipe
 * commits. Both the commit-threshold check and the rubber-band boundary use
 * this value so that the visual "committed" signal appears exactly when the
 * gesture would commit on release.
 */
export const SWIPE_THRESHOLD = 0.3;
const MIN_SWIPE_PX = 8;
const HORIZONTAL_LOCK_RATIO = 1.0;
const VERTICAL_LOCK_RATIO = 1.5;
const VELOCITY_MIN_DISTANCE_PX = 30;
const VELOCITY_MIN_PROGRESS = 0.2;
const VELOCITY_COMMIT_PX_PER_MS = 0.45;
/** Fraction of the over-threshold overshoot that feeds into the visual offset. */
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

interface SwipePointerCaptureControls {
  setTouchActionNone: () => void;
  trySetPointerCapture: (pointerId: number) => void;
}

export const SWIPE_IDLE: SwipeState = {
  committed: false,
  offsetX: 0,
  phase: "idle",
  progress: 0,
};

/**
 * Apply swipe pointer movement to the runtime state.
 * @param event - The pointer event driving the swipe.
 * @param context - The swipe gesture context.
 */
export function applySwipePointerMoveState(
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
 * Create the fully committed swipe state.
 * @param isRight - Whether the gesture commits to the right.
 * @param width - The width of the swipe container.
 * @returns The committed swipe state.
 */
export function createCommittedSwipeState(
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
 * Resolve whether the current swipe should commit when the pointer ends.
 * @param event - The pointer-up event ending the gesture.
 * @param context - The swipe gesture context.
 * @returns Whether the swipe should commit.
 */
export function resolveShouldCommit(
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
 * Return whether the current pointer move should continue tracking a swipe.
 * @param event - The pointer move event.
 * @param context - The swipe gesture context.
 * @param controls - The pointer-capture controls used while tracking.
 * @returns Whether the swipe move should be tracked.
 */
export function shouldTrackSwipeMove(
  event: PointerEvent,
  context: SwipeGestureContext,
  controls: SwipePointerCaptureControls,
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

/**
 * Apply rubber-band damping to the swipe offset.
 *
 * The gesture tracks the pointer 1:1 up to the commit threshold distance so
 * the progress value reaches exactly {@link SWIPE_THRESHOLD} — the same value
 * used by the commit check — meaning the visual "committed" signal appears at
 * the precise moment the gesture would commit on release.
 *
 * Beyond the threshold the overshoot is scaled by {@link ELASTIC_DAMPING} to
 * give a tactile "stretching" resistance that communicates the point of no
 * return without letting the card fly too far.
 *
 * @param signedDelta - The signed distance the pointer has travelled in the
 *   direction of the swipe (always non-negative when this is called).
 * @param containerWidth - The width of the swipe container used to derive the
 *   absolute threshold distance in pixels.
 * @returns The display offset in pixels.
 */
function applyElasticDamping(
  signedDelta: number,
  containerWidth: number,
): number {
  const thresholdPx = containerWidth * SWIPE_THRESHOLD;
  if (signedDelta <= thresholdPx) {
    // Full 1:1 tracking up to the commit threshold.
    return signedDelta;
  }
  // Rubber-band: damp the overshoot while preserving the threshold distance.
  return thresholdPx + (signedDelta - thresholdPx) * ELASTIC_DAMPING;
}

/**
 * Resolve the signed swipe offset for the current pointer position.
 * @param clientX - The current pointer X position.
 * @param context - The swipe gesture context.
 * @returns The signed swipe offset in pixels.
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

  const width = context.containerWidthRef.current || 1;
  return (context.isRight ? 1 : -1) * applyElasticDamping(signedDelta, width);
}
