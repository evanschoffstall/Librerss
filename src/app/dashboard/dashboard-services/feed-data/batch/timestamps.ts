import type { FeedBatchSource } from "@/app/dashboard/dashboard-services/feed-data/batch/batch";
import type { BatchFeedResponseItem } from "@/lib/api/http";

/**
 * Return the newest last fetched at.
 * @param batchResults - The batch results.
 * @returns The newest last fetched at.
 */
export function getNewestLastFetchedAt(
  batchResults: BatchFeedResponseItem[],
): Date | null {
  return batchResults.reduce<Date | null>((latest, item) => {
    if (!item.lastFetchedAt) {
      return latest;
    }

    if (!latest || item.lastFetchedAt > latest) {
      return item.lastFetchedAt;
    }

    return latest;
  }, null);
}

/**
 * Return the source names by url.
 * @param sources - The sources.
 * @returns The source names by url.
 */
export function getSourceNamesByUrl(
  sources: FeedBatchSource[],
): Map<string, string | undefined> {
  return new Map(sources.map((source) => [source.url, source.name] as const));
}
