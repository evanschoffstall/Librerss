"use client";

import { useEffect, useRef, useState } from "react";

const SWIPE_THRESHOLD = 0.25;
/** Minimum travel before the gesture resolves horizontal vs. vertical intent. */
const MIN_SWIPE_PX = 8;
/**
 * Horizontal displacement must exceed vertical × this ratio to lock as a swipe.
 * 1.0 means equal-or-greater horizontal travel is enough to grab.
 */
const HORIZONTAL_LOCK_RATIO = 1.0;
/**
 * Vertical displacement must exceed horizontal × this ratio to lock as scroll.
 * 1.5 keeps ambiguous diagonals open for possible swipe resolution.
 */
const VERTICAL_LOCK_RATIO = 1.5;

/** Minimum px traveled to qualify for velocity-based commit. */
const VELOCITY_MIN_DISTANCE_PX = 30;
/** px/ms – a fast flick above this commits even below the distance threshold. */
const VELOCITY_COMMIT_PX_PER_MS = 0.45;
/** Damping factor for horizontal displacement past the commit threshold. */
const ELASTIC_DAMPING = 0.45;

/** Duration of the snap-back animation on non-committed release (ms). */
export const SWIPE_RELEASE_MS = 300;
/** Duration of the slide-out animation on committed swipe (ms). */
export const SWIPE_COMMIT_SLIDE_MS = 180;

export type SwipePhase = "committing" | "idle" | "releasing" | "swiping";

/** Visual state for an in-progress swipe gesture. */
interface SwipeState {
  committed: boolean;
  offsetX: number;
  phase: SwipePhase;
  progress: number;
}

/** Neutral gesture state used after cancellation, completion, or detach. */
const SWIPE_IDLE: SwipeState = {
  committed: false,
  offsetX: 0,
  phase: "idle",
  progress: 0,
};

/**
 * Attaches a touch-only horizontal swipe gesture to the current container ref.
 *
 * Features:
 * - Elastic resistance past the commit threshold for rubber-band feel
 * - Velocity-based commit for fast flick swipes
 * - Animated snap-back on release and slide-out on commit
 *
 * `reattachKey` lets callers force the hook to detach and rebind when the
 * target surface changes without recreating the hook instance.
 */
export function useSwipeGesture(
  direction: "left" | "right",
  onCommit: () => void,
  disabled = false,
  shouldIgnoreTarget?: (target: EventTarget | null) => boolean,
  reattachKey?: boolean | number | string,
) {
  const [state, setState] = useState(SWIPE_IDLE);
  const containerRef = useRef<HTMLElement>(null);
  const startRef = useRef<null | { x: number; y: number }>(null);
  const lockedRef = useRef<"horizontal" | "vertical" | null>(null);
  const containerWidthRef = useRef(0);
  const committedRef = useRef(false);
  const activePointerIdRef = useRef<null | number>(null);
  const hasCaptureRef = useRef(false);
  const disabledRef = useRef(disabled);
  const onCommitRef = useRef(onCommit);
  const releaseTimerRef = useRef<null | ReturnType<typeof setTimeout>>(null);
  /** Circular buffer of recent pointer positions for velocity calculation. */
  const velocityTrackRef = useRef<{ t: number; x: number }[]>([]);
  disabledRef.current = disabled;
  onCommitRef.current = onCommit;

  const isRight = direction === "right";

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const clearReleaseTimer = () => {
      if (releaseTimerRef.current !== null) {
        clearTimeout(releaseTimerRef.current);
        releaseTimerRef.current = null;
      }
    };

    /** Attempts pointer capture without letting platform quirks abort the swipe. */
    const trySetPointerCapture = (pointerId: number) => {
      try {
        el.setPointerCapture(pointerId);
        hasCaptureRef.current = true;
      } catch {
        hasCaptureRef.current = false;
      }
    };

    /** Restores `touch-action` on the element after a horizontal-lock override. */
    const restoreTouchAction = () => {
      if (el.style.touchAction === "none") {
        el.style.touchAction = "";
      }
    };

    const resetPointerState = () => {
      restoreTouchAction();
      startRef.current = null;
      lockedRef.current = null;
      committedRef.current = false;
      activePointerIdRef.current = null;
      hasCaptureRef.current = false;
      velocityTrackRef.current = [];
    };

    const releaseCapture = () => {
      const pointerId = activePointerIdRef.current;
      if (pointerId === null || !hasCaptureRef.current) return;
      try {
        if (el.hasPointerCapture(pointerId))
          el.releasePointerCapture(pointerId);
      } catch {
        // Ignore platform-specific capture failures; gesture state reset is enough.
      }
      hasCaptureRef.current = false;
    };

    /** Compute swipe velocity in px/ms from the recent pointer track. */
    const computeVelocity = (): number => {
      const track = velocityTrackRef.current;
      if (track.length < 2) return 0;
      const recent = track[track.length - 1];
      // Look back ~60ms for a stable velocity sample.
      let oldest = track[0];
      for (let i = track.length - 2; i >= 0; i--) {
        if (recent.t - track[i].t >= 60) {
          oldest = track[i];
          break;
        }
      }
      const dt = recent.t - oldest.t;
      // Require at least 16ms of tracking for a stable velocity sample;
      // synthetic test events fire with near-zero deltas otherwise.
      if (dt < 16) return 0;
      return (recent.x - oldest.x) / dt;
    };

    /**
     * Transitions to the "releasing" phase to animate the card back to rest.
     * Sets offsetX to 0 so the CSS transition animates the snap-back.
     */
    const animateRelease = () => {
      setState({ committed: false, offsetX: 0, phase: "releasing", progress: 0 });
      clearReleaseTimer();
      releaseTimerRef.current = setTimeout(() => {
        setState(SWIPE_IDLE);
        releaseTimerRef.current = null;
      }, SWIPE_RELEASE_MS);
    };

    const handlePointerDown = (e: PointerEvent) => {
      if (disabledRef.current || e.pointerType === "mouse") return;
      if (shouldIgnoreTarget?.(e.target)) return;
      // Cancel any in-progress release animation if the user re-grabs.
      clearReleaseTimer();
      setState(SWIPE_IDLE);
      activePointerIdRef.current = e.pointerId;
      startRef.current = { x: e.clientX, y: e.clientY };
      lockedRef.current = null;
      committedRef.current = false;
      containerWidthRef.current = el.offsetWidth || 300;
      velocityTrackRef.current = [{ t: e.timeStamp, x: e.clientX }];
    };

    const handlePointerMove = (e: PointerEvent) => {
      if (activePointerIdRef.current !== e.pointerId) return;
      const start = startRef.current;
      if (!start || disabledRef.current) return;
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      const absDx = Math.abs(dx);
      const absDy = Math.abs(dy);

      // Track velocity: keep last ~10 points.
      const track = velocityTrackRef.current;
      track.push({ t: e.timeStamp, x: e.clientX });
      if (track.length > 10) track.shift();

      if (!lockedRef.current) {
        if (absDx < MIN_SWIPE_PX && absDy < MIN_SWIPE_PX) return;

        const hasHorizontalIntent =
          (isRight ? dx > 0 : dx < 0) &&
          absDx >= MIN_SWIPE_PX &&
          absDx > absDy * HORIZONTAL_LOCK_RATIO;
        if (hasHorizontalIntent) {
          lockedRef.current = "horizontal";
          // Suppress native touch handling to prevent browser from firing
          // pointercancel when the user drifts vertically mid-swipe.
          el.style.touchAction = "none";
          if (!hasCaptureRef.current) trySetPointerCapture(e.pointerId);
        } else if (
          absDy >= MIN_SWIPE_PX &&
          absDy > absDx * VERTICAL_LOCK_RATIO
        )
          lockedRef.current = "vertical";
        else return;
      }

      if (lockedRef.current !== "horizontal") return;

      if (e.cancelable) e.preventDefault();

      const clampedDx = isRight ? Math.max(0, dx) : Math.min(0, dx);
      const elasticDx = applyElasticOffset(clampedDx, containerWidthRef.current);
      const progress = Math.min(
        Math.abs(clampedDx) / containerWidthRef.current,
        1,
      );
      const committed = progress >= SWIPE_THRESHOLD;
      committedRef.current = committed;
      setState({ committed, offsetX: elasticDx, phase: "swiping", progress });
    };

    const handlePointerEnd = (e: PointerEvent) => {
      if (activePointerIdRef.current !== e.pointerId) return;

      const wasCommittedByDistance = committedRef.current;
      const start = startRef.current;
      const totalDx = start ? Math.abs(e.clientX - start.x) : 0;

      // Velocity-based commit only applies to horizontally-locked gestures.
      const wasHorizontallyLocked = lockedRef.current === "horizontal";
      const velocity = computeVelocity();
      const isCorrectDirection = isRight ? velocity > 0 : velocity < 0;
      const wasCommittedByVelocity =
        !wasCommittedByDistance &&
        wasHorizontallyLocked &&
        isCorrectDirection &&
        Math.abs(velocity) >= VELOCITY_COMMIT_PX_PER_MS &&
        totalDx >= VELOCITY_MIN_DISTANCE_PX;

      const shouldCommit =
        (wasCommittedByDistance || wasCommittedByVelocity) &&
        !disabledRef.current;

      releaseCapture();

      if (shouldCommit) {
        // Slide out briefly in the swipe direction, then fire the action.
        const slideTarget = isRight
          ? containerWidthRef.current * 0.45
          : -(containerWidthRef.current * 0.45);
        setState({
          committed: true,
          offsetX: slideTarget,
          phase: "committing",
          progress: 1,
        });
        onCommitRef.current();
        clearReleaseTimer();
        releaseTimerRef.current = setTimeout(() => {
          setState(SWIPE_IDLE);
          releaseTimerRef.current = null;
        }, SWIPE_COMMIT_SLIDE_MS);
      } else {
        animateRelease();
      }

      resetPointerState();
    };

    const handlePointerCancel = (e: PointerEvent) => {
      if (activePointerIdRef.current !== e.pointerId) return;
      releaseCapture();
      animateRelease();
      resetPointerState();
    };

    const handleLostPointerCapture = (e: PointerEvent) => {
      if (activePointerIdRef.current === e.pointerId) {
        hasCaptureRef.current = false;
        return;
      }

      clearReleaseTimer();
      setState(SWIPE_IDLE);
      resetPointerState();
    };

    el.addEventListener("pointerdown", handlePointerDown, true);
    el.addEventListener("pointermove", handlePointerMove, {
      capture: true,
      passive: false,
    });
    el.addEventListener("pointerup", handlePointerEnd, true);
    el.addEventListener("pointercancel", handlePointerCancel, true);
    el.addEventListener("lostpointercapture", handleLostPointerCapture);

    return () => {
      clearReleaseTimer();
      releaseCapture();
      restoreTouchAction();
      el.removeEventListener("pointerdown", handlePointerDown, true);
      el.removeEventListener("pointermove", handlePointerMove, true);
      el.removeEventListener("pointerup", handlePointerEnd, true);
      el.removeEventListener("pointercancel", handlePointerCancel, true);
      el.removeEventListener("lostpointercapture", handleLostPointerCapture);
    };
  }, [isRight, reattachKey, shouldIgnoreTarget]);

  return { containerRef, swipeState: state };
}

/**
 * Applies elastic resistance past the commit threshold so the card
 * rubber-bands and signals the user has dragged far enough.
 */
function applyElasticOffset(rawDx: number, containerWidth: number): number {
  const thresholdPx = containerWidth * SWIPE_THRESHOLD;
  const absDx = Math.abs(rawDx);
  if (absDx <= thresholdPx) return rawDx;
  const excess = absDx - thresholdPx;
  const dampedExcess = excess * ELASTIC_DAMPING;
  const sign = rawDx > 0 ? 1 : -1;
  return sign * (thresholdPx + dampedExcess);
}
