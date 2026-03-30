/** Shared feed-surface scroll thresholds for pagination and underfill detection. */
export const FEED_LOAD_MORE_THRESHOLD_PX = 504;

/** Inverted mobile pagination should wait until the reader is near the top edge. */
export const FEED_INVERTED_LOAD_MORE_THRESHOLD_PX = 240;

/** A viewport is effectively underfilled when overflow stays within this range. */
export const FEED_MIN_SCROLLABLE_OVERFLOW_PX = 1;