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

/** Prevent boundary re-arming until a new server page has settled for one second. */
export const FEED_SERVER_LOAD_REARM_COOLDOWN_MS = 1_000;

/** Inverted mobile pagination should wait until the reader is near the top edge. */
export const FEED_INVERTED_LOAD_MORE_THRESHOLD_PX = 240;

/** A viewport is effectively underfilled when overflow stays within this range. */
export const FEED_MIN_SCROLLABLE_OVERFLOW_PX = 1;

/** Standard auto-fill can stop once a small real overflow exists. */
export const FEED_MIN_AUTOFILL_OVERFLOW_PX = 96;

/**
 * Minimum duration (ms) that skeleton rows remain visible during a cached
 * page reveal. The skeletons must be perceptible — not just technically
 * painted. The rAF guarantees at least one paint cycle; the timeout holds
 * the skeleton state long enough for the user to register the transition.
 */
export const SKELETON_MIN_VISIBLE_MS = 150;

/**
 * Minimum extra rows rendered beyond `articlesPerPage` so that the
 * IntersectionObserver sentinel element sits within observable range.
 * The initial hydration renders `articlesPerPage + SENTINEL_OVERFLOW_ARTICLES`
 * rows total.
 */
export const SENTINEL_OVERFLOW_ARTICLES = 1;
