/**
 * Pure article-status toggle helpers shared by dashboard action tests.
 *
 * Keeping these helpers in the services layer avoids mixing non-hook modules
 * into the hooks directory while preserving a stable surface for direct tests.
 */

/** Returns the next read state for an article toggle interaction. */
export const toggleReadStatus = (isRead: boolean) => !isRead;

/** Returns the next starred state for an article toggle interaction. */
export const toggleStarredStatus = (isStarred: boolean) => !isStarred;