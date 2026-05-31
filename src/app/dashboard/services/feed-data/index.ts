export {
  applyPlaceholderArticleLocalState,
  mergeFeedArticleLocalState,
  resetPlaceholderArticleLocalStateForTesting,
  retainMissingPreviousFeedArticles,
  setPlaceholderArticleReadState,
} from "@/app/dashboard/services/feed-data/local-state";
export { resolveFeedBatchResults } from "@/app/dashboard/services/feed-data/resolve-feed-batch-results";
export {
  loadFeedSourceTree,
  normalizeFeedSourceInput,
  resolvePostEnabledToggleSelection,
  resolvePostRemovalSelection,
  selectFeedByKeyFromCategories,
} from "@/app/dashboard/services/feed-data/source";
export {
  findDashboardFeedViewport,
  getViewportOffsetTop,
  isDashboardFeedViewport,
  observeFeedViewportLayout,
  resolveFeedViewport,
} from "@/app/dashboard/services/feed-data/viewport";
