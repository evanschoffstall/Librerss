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
 * Manage the feed pagination.
 * @param options - The options used to manage the feed pagination.
 * @returns The feed pagination state and callbacks.
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
    buildFeedPaginationEffectsOptions(
      options,
      canLoadMoreFromServer,
      controllers,
    ),
  );
  return useFeedPaginationRuntime(
    buildFeedPaginationRuntimeOptions(
      options,
      canLoadMoreFromServer,
      controllers,
    ),
  );
}

/**
 * Build the feed pagination effects options.
 * @param options - The options used to build the feed pagination effects options.
 * @param canLoadMoreFromServer - Whether can load more from server.
 * @param controllers - The callback that controllers.
 * @returns The feed pagination effects options.
 */
function buildFeedPaginationEffectsOptions(
  options: UseFeedPaginationOptions,
  canLoadMoreFromServer: boolean,
  controllers: ReturnType<typeof useFeedPaginationControllers>,
) {
  return { ...options, canLoadMoreFromServer, controllers };
}

/**
 * Build the feed pagination runtime options.
 * @param options - The options used to build the feed pagination runtime options.
 * @param canLoadMoreFromServer - Whether can load more from server.
 * @param controllers - The callback that controllers.
 * @returns The feed pagination runtime options.
 */
function buildFeedPaginationRuntimeOptions(
  options: UseFeedPaginationOptions,
  canLoadMoreFromServer: boolean,
  controllers: ReturnType<typeof useFeedPaginationControllers>,
) {
  return { ...options, canLoadMoreFromServer, controllers };
}
