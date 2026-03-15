/** Approximate row height used to convert the page-size preference into preload distance. */
export const VIRTUAL_FEED_ROW_ESTIMATE_PX = 168;
/** Viewport distance from the bottom that should trigger the next page load. */
export const FEED_LOAD_MORE_THRESHOLD_PX = VIRTUAL_FEED_ROW_ESTIMATE_PX * 3;
export const FEED_ROW_COLLAPSE_HEIGHT_DELAY_MS = 90;
export const FEED_ROW_COLLAPSE_FLOOR_PX = 12;
export const FEED_ROW_GAP_PX = 6;
export const FEED_ROW_COLLAPSE_OFFSET_PX =
  FEED_ROW_COLLAPSE_FLOOR_PX + FEED_ROW_GAP_PX;
export const FEED_ROW_REFLOW_ANIMATION_MS = 220;
export const FEED_ROW_SWIPE_EXIT_DISTANCE = "calc(100% + 4rem)";
export const FEED_ROW_VIRTUAL_OVERSCAN = 6;
export const FEED_ROW_EXIT_EASING = [0.22, 1, 0.36, 1] as const;
export const FEED_ROW_OPACITY_EASING = [0.16, 1, 0.3, 1] as const;
export const FEED_ROW_SWIPE_EXIT_EASING = [0.2, 0, 0, 1] as const;
