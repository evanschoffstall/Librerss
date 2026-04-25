import { logger } from "@/lib";

/** Normalized article row returned from the batch feed pipeline. */
export interface ArticleRow {
  content: string;
  feedId: number;
  hasFullContent?: boolean;
  id: number;
  isRead: boolean;
  isStarred: boolean;
  lastChecked: Date;
  link: string;
  publicationDate: Date;
  title: string;
}

/** Raw ranked-row payload returned from the top-per-feed article query. */
export interface RankedRow extends Record<string, unknown> {
  content: unknown;
  feedId: unknown;
  id: unknown;
  isRead: unknown;
  isStarred: unknown;
  lastChecked: unknown;
  link: unknown;
  publicationDate: unknown;
  title: unknown;
}

/** Refresh plan entry describing whether a feed should refresh or use cache. */
export interface RefreshDecision {
  decision:
    | "force-cooldown-use-cache"
    | "missing-feed-record"
    | "refresh-force"
    | "refresh-stale"
    | "refresh-upstream-override"
    | "skip-refresh-flag"
    | "use-cache";
  lastFetched?: Date;
  url: string;
}

/**
 * Return whether is valid ranked row.
 * @param row - The row.
 * @returns Whether is valid ranked row.
 */
export function isValidRankedRow(row: RankedRow): boolean {
  const isValid = [
    isStringOrNumber(row.id),
    isNullableString(row.title),
    isNullableString(row.link),
    isNullableString(row.content),
    isDateLike(row.publicationDate),
    isStringOrNumber(row.feedId),
    isDateLike(row.lastChecked),
    isNullableBooleanLike(row.isRead),
    isNullableBooleanLike(row.isStarred),
  ].every(Boolean);

  if (!isValid) {
    logger.warn("Skipping malformed article row from database", {
      rowKeys: Object.keys(row),
    });
  }

  return isValid;
}

/**
 * Return whether is date like.
 * @param value - The value.
 * @returns Whether is date like.
 */
function isDateLike(value: unknown) {
  return typeof value === "string" || value instanceof Date;
}

/**
 * Return whether is nullable boolean like.
 * @param value - The value.
 * @returns Whether is nullable boolean like.
 */
function isNullableBooleanLike(value: unknown) {
  return (
    value === null || typeof value === "boolean" || typeof value === "number"
  );
}

/**
 * Return whether is nullable string.
 * @param value - The value.
 * @returns Whether is nullable string.
 */
function isNullableString(value: unknown) {
  return value === null || typeof value === "string";
}

/**
 * Return whether is string or number.
 * @param value - The value.
 * @returns Whether is string or number.
 */
function isStringOrNumber(value: unknown) {
  return typeof value === "number" || typeof value === "string";
}
