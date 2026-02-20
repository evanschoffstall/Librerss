// Main library exports - organized by domain

// Core: types, constants, utilities, hooks
export type {
  Article,
  CategoryTreeNode,
  Feed,
  FeedSource,
  ItemProps,
} from "./core/types";

export { API_CONSTANTS, ENV } from "./core/constants";

export {
  formatDate,
  getTimeDifferenceInMinutes,
  isClient,
  isValidUrl,
  truncateText,
} from "./core/utils";

export { useDebugState, useIsClient } from "./core/clientHooks";

// API clients
export { ArticleService, FeedService } from "./api/services";

// Shared utilities
export { cn, multiLine } from "./utils";
