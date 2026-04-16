import {
  useFeedPaginationControllers,
  useFeedPaginationEffects,
  useFeedPaginationRuntime,
} from "@/app/dashboard/dashboard-components/feed-view/feed-list-surface-state/useFeedPaginationCoordinator";

export interface UseFeedPaginationOptions {
  articleFilter: string;
  articlesPerPage: number;
  canLoadMoreFromServer?: boolean;
  clearInitialNormalScrollLock: () => void;
  feedViewKey: string;
  filteredFeedLength: number;
  hasActiveInvertedExpansionScrollLock: () => boolean;
  hasCollapsingArticles: boolean;
  hasUserScrolledRef: { current: boolean };
  isInitialLoading: boolean;
  isInvertedScroll: boolean;
  isLoadingMore: boolean;
  isRefreshing: boolean;
  onClaimInvertedScrollOwnership: () => void;
  onLoadMore?: () => void;
  onReleaseInvertedExpansionScrollLock: () => void;
  onResetInvertedScrollOwnership: () => void;
  onSyncInvertedExpansionScrollLock: () => void;
  refreshEpoch: number;
  scrollViewport: HTMLElement | null;
  searchTerm: string;
  shouldLockInitialNormalScroll: () => boolean;
}

/**
 * Owns visible-window sizing, scroll-triggered pagination, and viewport auto-fill.
 *
 * This keeps feed paging mechanics separate from the higher-level viewport lock
 * and anchor logic so the main hook reads as orchestration instead of event soup.
 */
export function useFeedPagination(options: UseFeedPaginationOptions) {
  const canLoadMoreFromServer = options.canLoadMoreFromServer ?? false;
  const controllers = useFeedPaginationControllers({
    articlesPerPage: options.articlesPerPage,
    canLoadMoreFromServer,
    filteredFeedLength: options.filteredFeedLength,
    hasCollapsingArticles: options.hasCollapsingArticles,
    hasUserScrolledRef: options.hasUserScrolledRef,
    isInvertedScroll: options.isInvertedScroll,
    isLoadingMore: options.isLoadingMore,
    isRefreshing: options.isRefreshing,
    onLoadMore: options.onLoadMore,
    onResetInvertedScrollOwnership: options.onResetInvertedScrollOwnership,
    refreshEpoch: options.refreshEpoch,
    scrollViewport: options.scrollViewport,
  });
  useFeedPaginationEffects(
    buildFeedPaginationEffectsOptions(options, canLoadMoreFromServer, controllers),
  );
  return useFeedPaginationRuntime(
    buildFeedPaginationRuntimeOptions(options, canLoadMoreFromServer, controllers),
  );
}

function buildFeedPaginationEffectsOptions(
  options: UseFeedPaginationOptions,
  canLoadMoreFromServer: boolean,
  controllers: ReturnType<typeof useFeedPaginationControllers>,
) {
  return { ...options, canLoadMoreFromServer, controllers };
}

function buildFeedPaginationRuntimeOptions(
  options: UseFeedPaginationOptions,
  canLoadMoreFromServer: boolean,
  controllers: ReturnType<typeof useFeedPaginationControllers>,
) {
  return { ...options, canLoadMoreFromServer, controllers };
}
