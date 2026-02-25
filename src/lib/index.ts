// Main library exports - organized by domain

// Core: types, constants, utilities, hooks
export type { Article, AuthUser, CategoryTreeNode } from "./core/types";

export { ENV } from "./config";

export { useDebugState } from "@/hooks/useDebugState";
export { useLocalStorage } from "@/hooks/useLocalStorage";
export { useSessionState } from "@/hooks/useSessionState";

// API clients
export { ArticleService, AuthService, FeedService } from "./api/services";

// Shared utilities
export {
  DEFAULT_CATEGORY_LABEL,
  findCategoryByLabel,
  includesCategoryLabel,
  isSameCategoryLabel,
  normalizeCategory,
  normalizeCategoryLabelKey,
  removeCategoryLabel,
  replaceCategoryLabel
} from "./utils/categories";
export { formatRelativeDate } from "./utils/date-utils";
export { parseOpmlFeedImport } from "./utils/opml";
export type { OpmlFeedImportEntry } from "./utils/opml";
export { isValidUrl } from "./utils/url";
export { isSafePositiveItemId } from "./utils/validation";

