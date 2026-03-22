import { logger } from "@/lib/logger";

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
    | "skip-refresh-flag"
    | "use-cache";
  lastFetched?: Date;
  url: string;
}

/**
 * Verifies that a database row contains the fields required to become an article preview.
 *
 * The batch pipeline revalidates these fields before coercion so malformed or
 * partial query results never leak NaN or invalid dates into the dashboard.
 */
export function isValidRankedRow(row: RankedRow): boolean {
  const isValid =
    (typeof row.id === "number" || typeof row.id === "string") &&
    (typeof row.title === "string" || row.title === null) &&
    (typeof row.link === "string" || row.link === null) &&
    (typeof row.content === "string" || row.content === null) &&
    (typeof row.publicationDate === "string" ||
      row.publicationDate instanceof Date) &&
    (typeof row.feedId === "number" || typeof row.feedId === "string") &&
    (typeof row.lastChecked === "string" || row.lastChecked instanceof Date) &&
    (typeof row.isRead === "boolean" ||
      row.isRead === null ||
      typeof row.isRead === "number") &&
    (typeof row.isStarred === "boolean" ||
      row.isStarred === null ||
      typeof row.isStarred === "number");

  if (!isValid) {
    const warn =
      typeof logger.warn === "function" ? logger.warn.bind(logger) : undefined;
    warn?.("Skipping malformed article row from database", {
      rowKeys: Object.keys(row),
    });
  }

  return isValid;
}