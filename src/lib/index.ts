// Main library exports - organized by domain

// API clients
export {
  AccountService,
  ArticleService,
  AuthService,
  FeedService,
} from "./api/services";
// Core: types, constants, utilities, hooks
export type {
  Article,
  AuthSession,
  AuthUser,
  CategoryTreeNode,
  FeedSource,
} from "./core/types";
export { useDebugState } from "./hooks/useDebugState";
export { useIsMobile } from "./hooks/useIsMobile";
export { useLocalStorage } from "./hooks/useLocalStorage";

export { useSessionState } from "./hooks/useSessionState";
export { useViewportRestore } from "./hooks/useViewportRestore";

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
