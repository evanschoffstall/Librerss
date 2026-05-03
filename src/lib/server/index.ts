export { getHostname } from "./extract-endpoint";
export {
  consumeFatalServerError,
  type FatalServerErrorRecord,
  recordFatalServerError,
  resetFatalServerErrorsForTesting,
} from "./fatal-error-registry";
export { requireMutableFeedAccess } from "./feed-access";
export {
  type AuthenticatedUser,
  isRouteHandlerContext,
  type RouteHandlerContext,
  ServerServiceError,
} from "./guard-contracts";
export { RateLimiter, rateLimiter } from "./rate-limit";
export * as serverApi from "./server-api";
export { logAndRespondError } from "./server-api";
export {
  type BatchFetchExecutionResult,
  type BatchRequestBody,
  type BatchRequestCompletedOptions,
  type BatchRequestState,
  type BatchUrlDescriptor,
  buildBatchFetchExecutionResult,
  buildBatchFetchRequestOptions,
  buildBatchFetchResults,
  buildBatchIntent,
  buildBatchResultItem,
  buildInvalidBatchResultResponse,
  createBatchSuccessResponse,
  ensureBatchUrlCount,
  executeIsolatedFeedBatchFallback,
  ISOLATED_FEED_BATCH_FALLBACK_BUDGET_EXHAUSTED_MESSAGE,
  logBatchDiagnostics,
  logBatchRequestCompleted,
  logBatchRequestReceived,
  logBatchRequestReceivedWhenEnabled,
  logBatchStatusSummary,
  logBatchWarnings,
  type NormalizedBatchUrls,
  parseBatchSearchTerm,
  resolveNormalizedBatchUrls,
  validateBatchRequestState,
} from "@/lib/server/batch";
export {
  createArticle,
  type CreateArticleParams,
  createFeed,
  deleteAccount,
  deleteFeed,
  exportAccountData,
  getArticleById,
  getCategoryOrder,
  listUserArticles,
  markStreamRead,
  renameFeed,
  saveCategoryOrder,
  setFeedEnabled,
  type StatusUpdate,
  updateArticleStatus,
  updateFeedSettings,
} from "@/lib/server/services";
