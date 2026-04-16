/** Domain-level feed source used by the dashboard tree and placeholder mode. */
export interface FeedSource extends FeedSourceBase {
  category?: string;
}

/** Feed source row returned by the feed-list API surface. */
export type FeedSourceListRow = FeedSourceRecord & {
  category: null | string;
};

/** Persisted feed source row returned from feed mutation operations. */
export type FeedSourceRecord = FeedSourceBase;

/**
 * Shared feed-source shape used across server services, dashboard state, and
 * placeholder source manifests.
 */
interface FeedSourceBase {
  enabled?: boolean;
  extractionDisabled?: boolean;
  id: number;
  name: string;
  proxyEnabled?: boolean;
  url: string;
}
