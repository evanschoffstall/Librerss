// Main library exports - organized by domain

// Core: types, constants, utilities, hooks
export type { Article, AuthUser, CategoryTreeNode } from "./core/types";

export { CONFIG, ENV } from "./config";

export { useDebugState } from "@/hooks/useDebugState";
export { useLocalStorage } from "@/hooks/useLocalStorage";
export { useSessionState } from "@/hooks/useSessionState";

// API clients
export { ArticleService, AuthService, FeedService } from "./api/services";

// Shared utilities
export {
  DEFAULT_CATEGORY_LABEL, findCategoryByLabel, includesCategoryLabel, isSameCategoryLabel,
  normalizeCategory,
  normalizeCategoryLabelKey, removeCategoryLabel, replaceCategoryLabel
} from "./utils/categories";
export { cn } from "./utils/cn";
export { formatRelativeDate } from "./utils/date-utils";
export { toErrorMessage } from "./utils/errors";
export { logger } from "./utils/logger";
export { parseOpmlFeedImport } from "./utils/opml";
export type { OpmlFeedImportEntry } from "./utils/opml";
export { toPlainText } from "./utils/sanitize";
export {
  getUrlHostnameLabel, isValidUrl, normalizeFeedUrl, toCategoryLookupKey, tryGetUrlHostname, tryNormalizeFeedUrl
} from "./utils/url";
export { isSafePositiveItemId } from "./utils/validation";

