// Main library exports - organized by domain

// Core utilities, types, constants, and hooks
export type {
  Article,
  CategoryTreeNode, Feed, ItemProps, StarStyle
} from "./core/types";

export {
  API_CONSTANTS,
  ENV, LANDING_CONTENT, MENU_ITEMS, SPACE_CONSTANTS
} from "./core/constants";

export {
  formatDate, getRandomNumber, getTimeDifferenceInMinutes, isClient, isValidUrl, truncateText
} from "./core/utils";

export {
  useDebugState, useIsClient
} from "./core/clientHooks";

// Services - API, database, and UI utilities
export {
  ArticleService, FeedService
} from "./services/services";

export {
  requestAIforNewsArticleRelatedImageURL, sendPromptToChatGPT
} from "./services/chatgpt";

export { prisma } from "./services/prisma";

export { multiLine } from "./services/textUtils";

