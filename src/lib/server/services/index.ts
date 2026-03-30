export {
  deleteAccount,
  exportAccountData,
} from "./account-service";

export {
  createArticle,
  type CreateArticleParams,
  getArticleById,
  listUserArticles,
  markStreamRead,
  type StatusUpdate,
  updateArticleStatus,
} from "./article-service";

/**
 * Barrel for server-side service modules.
 *
 * These transport-agnostic operations are shared across API surfaces (REST,
 * GReader, etc.). Route handlers call service functions after handling
 * authentication and request parsing.
 */
export { ServerServiceError } from "./errors";

export {
  createFeed,
  deleteFeed,
  getCategoryOrder,
  renameFeed,
  saveCategoryOrder,
  setFeedEnabled,
  updateFeedSettings,
} from "./feed-service";

export {
  getProxyRoutingCheck,
  getProxyStatus,
  type ProxyRoutingCheckResult,
  type ProxyStatusResult,
  type ResolvedUserProxy,
  resolveUserProxy,
} from "./proxy-service";
