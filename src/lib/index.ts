// Main library exports - organized by domain

// Core: types, constants, utilities, hooks
export type {
  Article,
  AuthSession,
  AuthUser,
  CategoryTreeNode,
  Feed,
  FeedSource,
  ItemProps,
} from "./core/types";

export { ENV } from "./core/utils";

export {
  formatDate,
  getTimeDifferenceInMinutes,
  isClient,
  isValidUrl,
  truncateText,
} from "./core/utils";

export {
  useDebugState,
  useIsClient,
  useLocalStorage,
} from "./core/clientHooks";

// API clients
export { ArticleService, AuthService, FeedService } from "./api/services";

// Shared utilities
export {
  cn,
  DEFAULT_CATEGORY_LABEL,
  isDefaultCategory,
  multiLine,
  normalizeCategory,
  parseOpmlFeedImport,
} from "./utils";
export type { OpmlFeedImportEntry } from "./utils";
