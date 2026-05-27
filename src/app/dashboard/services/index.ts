export {
  ARTICLE_FILTER_OPTIONS,
  buildPreview,
  filterArticlesByState,
  getArticleKey,
  getArticleSourceLabel,
  getRichContentClass,
  resolveArticleWindowAvailability,
  shouldBlockArticleWindowLoadMore,
  shouldRefillDepletedUnreadWindow,
} from "@/app/dashboard/services/article";
export type {
  ArticleFilter,
  ArticleWindowAvailabilityResult,
  ResolveArticleWindowAvailabilityOptions,
  ShouldBlockArticleWindowLoadMoreOptions,
  ShouldRefillDepletedUnreadWindowOptions,
} from "@/app/dashboard/services/article";
export {
  ALL_FEEDS_NODE_KEY,
  AUTO_REFRESH_INTERVAL_STORAGE_KEY,
  DASHBOARD_ARTICLE_FILTER_STORAGE_KEY,
  DASHBOARD_ARTICLE_SORT_ORDER_STORAGE_KEY,
  DASHBOARD_ARTICLES_PER_PAGE_STORAGE_KEY,
  DASHBOARD_EVENTS,
  DASHBOARD_SELECTED_CATEGORY_STORAGE_KEY,
  MANUAL_REFRESH_INTERVAL_MINUTES,
  MIN_AUTO_REFRESH_INTERVAL_MINUTES,
  MOBILE_INVERTED_SCROLL_STORAGE_KEY,
  MOBILE_UI_GROUPED_LAYOUT_STORAGE_KEY,
  normalizeAutoRefreshIntervalMinutes,
  resolveDefaultAutoRefreshIntervalMinutes,
  SETTINGS_PANEL_TAB_STORAGE_KEY,
  toAutoRefreshIntervalMs,
} from "@/app/dashboard/services/dashboard-preferences";
export type { BackgroundMode } from "@/app/dashboard/services/dashboard-preferences";
export { setCachedFaviconIndex } from "@/app/dashboard/services/favicon";
export {
  collectFullyVisibleUnreadArticles,
  getFeedBatchQueryKey,
  getFeedSourceTreeQueryKey,
} from "@/app/dashboard/services/feed-view-model";
export { importOpmlFeedsAndRefresh } from "@/app/dashboard/services/opml-import";
export type {
  FeedFetchOptions,
  FeedSelectionFetchers,
} from "@/app/dashboard/services/selection";
export {
  initializeDashboardSelection,
  refreshCurrentSelection,
} from "@/app/dashboard/services/selection";
export {
  clearCompatibilityResultsCache,
  formatElapsed,
  hasConfiguredProxyStatus,
  normalizeCompatibilityResults,
  previewText,
  readCompatibilityResultsCache,
  toProxySettingsSnapshot,
  writeCompatibilityResultsCache,
} from "@/app/dashboard/services/settings-proxy";
export type {
  CompatibilityResult,
  ProxyRoutingCheck,
  ProxySettingsSnapshot,
  ProxyUIStatus,
} from "@/app/dashboard/services/settings-proxy";
export {
  buildCategoriesFromSources,
  buildDefaultCategories,
  buildDisplayCategories,
  collectKnownCategoryLabels,
  computeNextOrderedCategoryLabels,
  getAllFeedNodes,
  getFeedUrlBySelectedKey,
  getFirstFeedNode,
  hasCategoryLabelInTree,
  SYSTEM_ALL_FEEDS_CATEGORY,
  toCategoryKey,
  toDistinctCategoryLabels,
} from "@/app/dashboard/services/taxonomy-map";
