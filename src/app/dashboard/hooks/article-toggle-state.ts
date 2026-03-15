/**
 * Small pure helpers for toggling article read and starred state.
 *
 * Keeping these helpers separate lets the action hook stay focused on runtime
 * orchestration while tests can still verify the pure toggle semantics directly.
 */

/** Returns the next read state for an article toggle interaction. */
export const toggleReadStatus = (isRead: boolean) => !isRead;

/** Returns the next starred state for an article toggle interaction. */
export const toggleStarredStatus = (isStarred: boolean) => !isStarred;
