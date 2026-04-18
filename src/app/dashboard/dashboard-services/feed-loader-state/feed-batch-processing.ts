export {
  getNewestLastFetchedAt,
  getSourceNamesByUrl,
} from "@/app/dashboard/dashboard-services/feed-data/batch";

/**
 * @param timestamp
 */
export function formatLastRefreshLabel(timestamp: Date | null): string {
  if (!timestamp) {
    return "never";
  }

  const elapsedMs = Date.now() - timestamp.getTime();
  if (elapsedMs < 60_000) {
    return "just now";
  }

  const elapsedMinutes = Math.floor(elapsedMs / 60_000);
  if (elapsedMinutes < 60) {
    return `${elapsedMinutes}m ago`;
  }

  const elapsedHours = Math.floor(elapsedMinutes / 60);
  if (elapsedHours < 24) {
    return `${elapsedHours}h ago`;
  }

  return `${Math.floor(elapsedHours / 24)}d ago`;
}
