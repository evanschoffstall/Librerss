/** Shared feed-surface scroll thresholds for pagination and underfill detection. */
export const FEED_LOAD_MORE_THRESHOLD_PX = 504;

/** Standard desktop pagination should start before exact bottom, at 70% progress. */
export const FEED_STANDARD_LOAD_MORE_TRIGGER_RATIO = 0.7;

/** Prevent boundary re-arming until a new server page has settled for one second. */
export const FEED_SERVER_LOAD_REARM_COOLDOWN_MS = 1_000;

/** Inverted mobile pagination should wait until the reader is near the top edge. */
export const FEED_INVERTED_LOAD_MORE_THRESHOLD_PX = 240;

/** A viewport is effectively underfilled when overflow stays within this range. */
export const FEED_MIN_SCROLLABLE_OVERFLOW_PX = 1;