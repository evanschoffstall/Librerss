/**
 * Google Reader-compatible stream ID constants, helpers, and item ID
 * encoding/decoding utilities.
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

// ── Reader item ID encoding / decoding ───────────────────────────────────────

const READER_ITEM_ID_PREFIX = "tag:google.com,2005:reader/item/";

export function toReaderItemId(articleId: number): string {
  return `${READER_ITEM_ID_PREFIX}${articleId.toString(16)}`;
}

export function parseReaderItemId(rawId: string): number | null {
  const trimmed = rawId.trim();
  if (!trimmed) {
    return null;
  }

  const lastSegment = trimmed.includes("/")
    ? trimmed.slice(trimmed.lastIndexOf("/") + 1)
    : trimmed;

  if (/^[0-9a-f]+$/i.test(lastSegment)) {
    const hexValue = Number.parseInt(lastSegment, 16);
    if (!Number.isNaN(hexValue) && hexValue > 0) {
      return hexValue;
    }
  }

  const decimalValue = Number.parseInt(lastSegment, 10);
  if (!Number.isNaN(decimalValue) && decimalValue > 0) {
    return decimalValue;
  }

  return null;
}
