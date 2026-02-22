// Main library exports - organized by domain

// Core: types, constants, utilities, hooks
export type {
  Article,
  AuthSession,
  AuthUser,
  CategoryTreeNode,
  Feed,
  FeedSource,
} from "./core/types";

export { ENV } from "./config";

export { formatRelativeDate } from "./utils/date-utils";

export { isValidUrl } from "./utils/url";

export { useDebugState, useLocalStorage } from "./core/clientHooks";

// API clients
export { ArticleService, AuthService, FeedService } from "./api/services";

// Shared utilities
export {
  DEFAULT_CATEGORY_LABEL,
  normalizeCategory,
  parseOpmlFeedImport,
} from "./utils";
export type { OpmlFeedImportEntry } from "./utils";
