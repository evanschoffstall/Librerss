/**
 * Shared style constants for dashboard components.
 */

/**
 * Standard transition for color changes (e.g., hover states, theme switches).
 * Duration and easing are controlled by custom animation classes.
 */
export const ANIM_TRANSITION_COLORS =
  "transition-colors anim-duration-ui anim-ease-ui" as const;

/**
 * Standard transition for opacity changes with the same timing.
 */
export const ANIM_TRANSITION_OPACITY =
  "transition-opacity anim-duration-ui anim-ease-ui" as const;
