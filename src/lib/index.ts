// Main library exports - organized by domain

// API clients
export { ArticleService, AuthService, FeedService } from "./api/services";
// Core: types, constants, utilities, hooks
export type { Article, AuthUser, CategoryTreeNode } from "./core/types";
export { useLocalStorage } from "./hooks/useLocalStorage";

export { useSessionState } from "./hooks/useSessionState";

// Shared utilities
export {
  DEFAULT_CATEGORY_LABEL,
  findCategoryByLabel,
  includesCategoryLabel,
  isSameCategoryLabel,
  normalizeCategory,
  normalizeCategoryLabelKey,
  removeCategoryLabel,
  replaceCategoryLabel,
} from "./utils/categories";
export { formatRelativeDate } from "./utils/dates";
export type { OpmlFeedImportEntry } from "./utils/opml";
export { generateOpml, parseOpmlFeedImport } from "./utils/opml";
export { isValidUrl } from "./utils/url";
export { isSafePositiveItemId } from "./utils/validation";
