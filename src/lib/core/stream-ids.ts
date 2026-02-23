/**
 * Google Reader-compatible stream ID constants and helpers.
 * Shared between the GReader API handlers and the core lib (e.g.
 * mark-stream-read) to avoid route-level imports in lib code.
 */

export const FEED_STREAM_PREFIX = "feed/";
export const USER_LABEL_PREFIX = "user/-/label/";
export const READING_LIST_STREAM = "user/-/state/com.google/reading-list";
export const READ_STATE = "user/-/state/com.google/read";
export const STARRED_STATE = "user/-/state/com.google/starred";

/**
 * Extracts the label name from a `user/-/label/<label>` stream ID.
 * Returns `null` if the ID does not start with the user-label prefix or if
 * the label portion is empty.
 */
export function parseUserLabel(id: string): string | null {
  if (!id.startsWith(USER_LABEL_PREFIX)) return null;
  return id.slice(USER_LABEL_PREFIX.length) || null;
}
