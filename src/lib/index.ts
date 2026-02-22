// Main library exports - organized by domain

// Core: types, constants, utilities, hooks
export type { Article, AuthUser, CategoryTreeNode } from "./core/types";

export { ENV } from "./config";

export { useDebugState, useLocalStorage } from "./core/clientHooks";

// API clients
export { ArticleService, AuthService, FeedService } from "./api/services";

// Shared utilities
export {
  DEFAULT_CATEGORY_LABEL,
  formatRelativeDate,
  getUrlHostnameLabel,
  isSameCategoryLabel,
  isValidUrl,
  normalizeCategory,
  normalizeCategoryLabelKey,
  parseOpmlFeedImport,
  tryGetUrlHostname,
  tryNormalizeFeedUrl
} from "./utils";
export type { OpmlFeedImportEntry } from "./utils";

