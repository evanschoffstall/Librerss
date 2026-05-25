export {
  BACKGROUND_CANVAS_BASELINE_FRAME_MS,
  BACKGROUND_CANVAS_MAX_DPR,
  BACKGROUND_CANVAS_RESUME_GAP_MS,
  BACKGROUND_CANVAS_TARGET_FRAME_MS,
  getBackgroundCanvasLerpFactor,
  getBackgroundCanvasScale,
  getBackgroundParallaxOffset,
  getVisibleBackgroundCanvasElementSize,
  shouldRenderBackgroundCanvasFrame,
  shouldResetBackgroundCanvasFrameClock,
  shouldRunBackgroundAnimation,
} from "./background-canvas";

export type { BackgroundCanvasElementSize } from "./background-canvas";
