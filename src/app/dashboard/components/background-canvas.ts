/** Maximum device-pixel ratio used by animated dashboard canvases. */
export const BACKGROUND_CANVAS_MAX_DPR = 1.5;

/** Target frame budget used to keep decorative background animation inexpensive. */
export const BACKGROUND_CANVAS_TARGET_FRAME_MS = 1000 / 30;

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
