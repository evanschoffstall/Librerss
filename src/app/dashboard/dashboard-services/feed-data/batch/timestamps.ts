import type { FeedBatchSource } from "@/app/dashboard/dashboard-services/feed-data/batch/batch";
import type { BatchFeedResponseItem } from "@/lib/api/http";

/**
 * @param batchResults
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
 * @param sources
 */
export function getSourceNamesByUrl(
  sources: FeedBatchSource[],
): Map<string, string | undefined> {
  return new Map(sources.map((source) => [source.url, source.name] as const));
}
