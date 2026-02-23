// Main library exports - organized by domain

// Core: types, constants, utilities, hooks
export type { Article, AuthUser, CategoryTreeNode } from "./core/types";

export { ENV } from "./config";

export { useDebugState } from "@/hooks/useDebugState";
export { useLocalStorage } from "@/hooks/useLocalStorage";

// API clients
export { ArticleService, AuthService, FeedService } from "./api/services";

// Shared utilities
export {
  DEFAULT_CATEGORY_LABEL,
  isSameCategoryLabel,
  normalizeCategory,
  normalizeCategoryLabelKey,
} from "./utils/categories";
export { formatRelativeDate } from "./utils/date-utils";
export { parseOpmlFeedImport } from "./utils/opml";
export type { OpmlFeedImportEntry } from "./utils/opml";
export {
  getUrlHostnameLabel,
  isValidUrl,
  tryGetUrlHostname,
  tryNormalizeFeedUrl,
} from "./utils/url";
