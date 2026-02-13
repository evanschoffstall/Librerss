// Main library exports - organized by domain

// Core utilities, types, constants, and hooks
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

// Services - API, database, and UI utilities
export { ArticleService, FeedService } from "./services/services";

export {
  requestAIforNewsArticleRelatedImageURL,
  sendPromptToChatGPT,
} from "./services/chatgpt";

export { multiLine } from "./services/textUtils";
