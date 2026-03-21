/** Maximum device-pixel ratio used by animated dashboard canvases. */
export const BACKGROUND_CANVAS_MAX_DPR = 1.5;

/** Target frame budget used to keep decorative background animation inexpensive. */
export const BACKGROUND_CANVAS_TARGET_FRAME_MS = 1000 / 30;
/** Baseline frame interval the original background motion was tuned for. */
export const BACKGROUND_CANVAS_BASELINE_FRAME_MS = 1000 / 60;

/**
 * Computes a frame-rate-independent interpolation factor for background motion.
 *
 * @param ease Per-frame easing divisor from the original animation tuning.
 * @param delta Elapsed time between committed animation frames in ms.
 * @param baselineFrameMs Reference frame interval used by the original tuning.
 * @returns Interpolation factor that preserves motion feel across frame rates.
 */
export function getBackgroundCanvasLerpFactor(
  ease: number,
  delta: number,
  baselineFrameMs = BACKGROUND_CANVAS_BASELINE_FRAME_MS,
) {
  const dtScale = delta > 0 ? Math.min(delta, 100) / baselineFrameMs : 1;
  return 1 - Math.pow(1 - 1 / ease, dtScale);
}

/**
 * Caps the effective device-pixel ratio for decorative dashboard canvases.
 *
 * These canvases sit behind interactive content, so rendering them above a
 * moderate DPR burns GPU fill rate without materially improving perceived
 * quality during scrolling.
 *
 * @param devicePixelRatio Browser-reported DPR value.
 * @returns Clamped DPR suitable for background canvas rendering.
 */
export function getBackgroundCanvasScale(devicePixelRatio?: number) {
  if (!devicePixelRatio || !Number.isFinite(devicePixelRatio)) {
    return 1;
  }

  return Math.min(Math.max(devicePixelRatio, 1), BACKGROUND_CANVAS_MAX_DPR);
}

/**
 * Computes a parallax offset that follows pointer motion with depth scaling.
 *
 * @param pointerOffset Pointer offset from canvas center on one axis.
 * @param staticity Higher values reduce displacement.
 * @param magnetism Per-star depth factor.
 * @param distanceMultiplier Additional displacement tuning multiplier.
 * @returns Target translation for one parallax axis.
 */
export function getBackgroundParallaxOffset(
  pointerOffset: number,
  staticity: number,
  magnetism: number,
  distanceMultiplier = 1,
) {
  return (
    (pointerOffset / (staticity / magnetism)) * distanceMultiplier
  );
}

/**
 * Returns whether the next animation frame should perform a real draw.
 *
 * Decorative background loops do not need to run at the browser's full refresh
 * rate. Skipping intermediate frames materially reduces CPU/GPU work while
 * keeping the animation visually smooth behind the dashboard UI.
 *
 * @param lastFrameAt Timestamp of the last committed draw.
 * @param now Current rAF timestamp.
 * @param targetFrameMs Minimum spacing between committed draws.
 * @returns True when the frame budget has elapsed and a draw should run.
 */
export function shouldRenderBackgroundCanvasFrame(
  lastFrameAt: number,
  now: number,
  targetFrameMs = BACKGROUND_CANVAS_TARGET_FRAME_MS,
) {
  return lastFrameAt === 0 || now - lastFrameAt >= targetFrameMs;
}

/**
 * Returns whether decorative dashboard background animation should be active.
 *
 * The canvases are purely ornamental, so they should pause when the document is
 * hidden or when the user explicitly requests reduced motion.
 *
 * @param visibilityState Current document visibility state.
 * @param prefersReducedMotion Whether the active media query requests reduced motion.
 * @returns True when animation work should continue.
 */
export function shouldRunBackgroundAnimation(
  visibilityState: DocumentVisibilityState | undefined,
  prefersReducedMotion: boolean,
) {
  return visibilityState !== "hidden" && !prefersReducedMotion;
}
