export type { FeedFetcherBatchRuntimeDependencies } from "./resolution";
export {
  resolveBatchFeedResolution,
  resolveBatchFeedResult,
  resolveBatchForceRefresh,
  resolveCachedBatchResult,
  runBatchRefreshExecution,
} from "./resolution";
export type {
  BatchFeedResolution,
  BatchFeedResult,
  BatchFetchOptions,
  BatchFetchRequest,
  BatchRefreshExecution,
  CachedBatchPayload,
  ChangedBatchArticleQuery,
  FeedFetchProxyOptions,
} from "./results";
export {
  buildCachedArticleMap,
  buildCachedBatchResponse,
  buildEmptyBatchResult,
  buildFeedIdlessBatchResult,
  buildLastFetchedByUrl,
  buildQueriedBatchResult,
  buildUnchangedBatchResult,
  collectUnchangedUrls,
  createBatchFetchRequest,
  sliceArticleMapByUrls,
} from "./results";
