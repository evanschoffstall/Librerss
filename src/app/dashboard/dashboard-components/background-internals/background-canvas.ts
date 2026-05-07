/** Maximum device-pixel ratio used by animated dashboard canvases. */
export const BACKGROUND_CANVAS_MAX_DPR = 1.5;

/** Target frame budget used to keep decorative background animation inexpensive. */
export const BACKGROUND_CANVAS_TARGET_FRAME_MS = 1000 / 30;
/** Baseline frame interval the original background motion was tuned for. */
export const BACKGROUND_CANVAS_BASELINE_FRAME_MS = 1000 / 60;

/** Visible CSS-pixel dimensions that are safe to commit to a canvas. */
export interface BackgroundCanvasElementSize {
  height: number;
  width: number;
}

/**
 * Return the interpolation factor for pointer parallax at the current frame.
 * @param ease - Higher values slow the interpolation response.
 * @param delta - Milliseconds elapsed since the previously rendered frame.
 * @param baselineFrameMs - Frame duration that the original motion tuning used.
 * @returns The normalized interpolation factor for the current frame delta.
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
 * Return the backing-store scale for decorative canvas rendering.
 * @param devicePixelRatio - Browser-reported device pixel ratio.
 * @returns A finite scale capped to keep background animation inexpensive.
 */
export function getBackgroundCanvasScale(devicePixelRatio?: number) {
  if (!devicePixelRatio || !Number.isFinite(devicePixelRatio)) {
    return 1;
  }

  return Math.min(Math.max(devicePixelRatio, 1), BACKGROUND_CANVAS_MAX_DPR);
}

/**
 * Return the target parallax offset for one axis of a canvas element.
 * @param pointerOffset - Pointer distance from the canvas center on one axis.
 * @param staticity - Dampening value that reduces pointer movement intensity.
 * @param magnetism - Per-element multiplier that creates depth variation.
 * @param distanceMultiplier - Additional mode-specific movement multiplier.
 * @returns The target translated offset for the element on the same axis.
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
 * Return visible element dimensions that are safe to use for a canvas resize.
 *
 * Mobile WebKit can dispatch resize lifecycle events while a suspended page is
 * being frozen or restored. During those events absolutely positioned layers may
 * temporarily report `0x0`; committing that measurement erases the backing store
 * and can collapse every seeded particle or star into a single corner. Treating
 * non-positive dimensions as unavailable preserves the last good geometry until
 * the resumed page reports real layout dimensions again.
 * @param container - The element whose CSS-pixel size owns the canvas backing store.
 * @returns The visible dimensions, or `null` when layout is not currently usable.
 */
export function getVisibleBackgroundCanvasElementSize(container: HTMLElement) {
  const width = container.offsetWidth;
  const height = container.offsetHeight;

  if (width <= 0 || height <= 0) {
    return null;
  }

  return { height, width } satisfies BackgroundCanvasElementSize;
}

/**
 * Return whether the throttled background loop should render this frame.
 * @param lastFrameAt - Timestamp of the previously rendered frame.
 * @param now - Timestamp of the current animation-frame callback.
 * @param targetFrameMs - Minimum elapsed time required between rendered frames.
 * @returns Whether the current frame should be rendered.
 */
export function shouldRenderBackgroundCanvasFrame(
  lastFrameAt: number,
  now: number,
  targetFrameMs = BACKGROUND_CANVAS_TARGET_FRAME_MS,
) {
  return lastFrameAt === 0 || now - lastFrameAt >= targetFrameMs;
}

/**
 * Return whether autonomous background animation should run for a page state.
 * @param visibilityState - Current document visibility, when available.
 * @param prefersReducedMotion - Whether the user requested reduced motion.
 * @returns Whether the decorative animation loop should advance autonomously.
 */
export function shouldRunBackgroundAnimation(
  visibilityState: DocumentVisibilityState | undefined,
  prefersReducedMotion: boolean,
) {
  return visibilityState !== "hidden" && !prefersReducedMotion;
}
