/** Maximum device-pixel ratio used by animated dashboard canvases. */
export const BACKGROUND_CANVAS_MAX_DPR = 1.5;

/** Target frame budget used to keep decorative background animation inexpensive. */
export const BACKGROUND_CANVAS_TARGET_FRAME_MS = 1000 / 30;
/** Baseline frame interval the original background motion was tuned for. */
export const BACKGROUND_CANVAS_BASELINE_FRAME_MS = 1000 / 60;

/**
 * Return the background canvas lerp factor.
 * @param ease - The ease.
 * @param delta - The delta.
 * @param baselineFrameMs - The baseline frame ms value.
 * @returns The background canvas lerp factor.
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
 * Return the background canvas scale.
 * @param devicePixelRatio - The device pixel ratio.
 * @returns The background canvas scale.
 */
export function getBackgroundCanvasScale(devicePixelRatio?: number) {
  if (!devicePixelRatio || !Number.isFinite(devicePixelRatio)) {
    return 1;
  }

  return Math.min(Math.max(devicePixelRatio, 1), BACKGROUND_CANVAS_MAX_DPR);
}

/**
 * Return the background parallax offset.
 * @param pointerOffset - The pointer offset value.
 * @param staticity - The staticity.
 * @param magnetism - The magnetism.
 * @param distanceMultiplier - The distance multiplier.
 * @returns The background parallax offset.
 */
export function getBackgroundParallaxOffset(
  pointerOffset: number,
  staticity: number,
  magnetism: number,
  distanceMultiplier = 1,
) {
  return (pointerOffset / (staticity / magnetism)) * distanceMultiplier;
}

/**
 * Return whether should render background canvas frame.
 * @param lastFrameAt - The last frame at.
 * @param now - The now.
 * @param targetFrameMs - The target frame ms value.
 * @returns Whether should render background canvas frame.
 */
export function shouldRenderBackgroundCanvasFrame(
  lastFrameAt: number,
  now: number,
  targetFrameMs = BACKGROUND_CANVAS_TARGET_FRAME_MS,
) {
  return lastFrameAt === 0 || now - lastFrameAt >= targetFrameMs;
}

/**
 * Return whether should run background animation.
 * @param visibilityState - The visibility state.
 * @param prefersReducedMotion - The prefers reduced motion.
 * @returns Whether should run background animation.
 */
export function shouldRunBackgroundAnimation(
  visibilityState: DocumentVisibilityState | undefined,
  prefersReducedMotion: boolean,
) {
  return visibilityState !== "hidden" && !prefersReducedMotion;
}
