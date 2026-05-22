/** Shared feed-surface scroll thresholds for pagination and underfill detection. */
export const FEED_LOAD_MORE_THRESHOLD_PX = 504;

/** Duration used to keep unread-filter removals mounted while the row exits. */
export const ARTICLE_REMOVAL_ANIMATION_MS = 180;

/** Duration used to keep de-expanding removals mounted while the row exits. */
export const ARTICLE_DEEXPAND_REMOVAL_ANIMATION_MS = 130;

/** Extra time reserved for post-collapse scroll restoration before release. */
export const ARTICLE_SCROLL_RESTORE_BUFFER_MS = 1200;

/** Standard desktop pagination should start before exact bottom, at 70% progress. */
export const FEED_STANDARD_LOAD_MORE_TRIGGER_RATIO = 0.7;

/** Prevent immediate duplicate load-more triggers while still re-arming quickly for repeated scroll intent. */
export const FEED_SERVER_LOAD_REARM_COOLDOWN_MS = 250;

/** Inverted mobile pagination should wait until the reader is near the top edge. */
export const FEED_INVERTED_LOAD_MORE_THRESHOLD_PX = 240;

/** A viewport is effectively underfilled when overflow stays within this range. */
export const FEED_MIN_SCROLLABLE_OVERFLOW_PX = 1;

/** Standard auto-fill can stop once a small real overflow exists. */
export const FEED_MIN_AUTOFILL_OVERFLOW_PX = 96;

/**
 * Minimum duration (ms) that skeleton rows remain visible during a cached
 * page reveal. The skeletons must be perceptible without holding the incoming
 * content longer than necessary.
 * The rAF guarantees at least one paint cycle; the timeout adds only a short
 * follow-through so the transition still reads as intentional.
 */
export const SKELETON_MIN_VISIBLE_MS = 150;
