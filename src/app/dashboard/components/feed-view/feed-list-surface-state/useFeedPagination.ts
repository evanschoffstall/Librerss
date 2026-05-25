import { useRef } from "react";

import {
  useFeedPaginationControllers,
  useFeedPaginationEffects,
  useFeedPaginationRuntime,
} from "@/app/dashboard/components/feed-view/feed-list-surface-state/useFeedPaginationCoordinator";

/**
 * Describes the options for use feed pagination.
 */
export interface UseFeedPaginationOptions {
  articleFilter: string;
  articlesPerPage: number;
  canLoadMoreFromServer?: boolean;
  clearInitialNormalScrollLock: () => void;
  expandedArticleKey: null | string;
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
 * Describes the maybe load next page ref.
 */
interface MaybeLoadNextPageRef {
  current: ((_trigger: "scroll" | "sentinel") => void) | null;
}

/**
 * Manage the feed pagination.
 * @param options - The options used to manage the feed pagination.
 * @returns The feed pagination state and callbacks.
 */
export function useFeedPagination(options: UseFeedPaginationOptions) {
  const canLoadMoreFromServer = options.canLoadMoreFromServer ?? false;
  const maybeLoadNextPageRef = useRef<MaybeLoadNextPageRef["current"]>(null);
  const controllers = useFeedPaginationControllers({
    articlesPerPage: options.articlesPerPage,
    canLoadMoreFromServer,
    expandedArticleKey: options.expandedArticleKey,
    filteredFeedLength: options.filteredFeedLength,
    hasCollapsingArticles: options.hasCollapsingArticles,
    hasUserScrolledRef: options.hasUserScrolledRef,
    isInvertedScroll: options.isInvertedScroll,
    isLoadingMore: options.isLoadingMore,
    isRefreshing: options.isRefreshing,
    maybeLoadNextPageRef,
    onLoadMore: options.onLoadMore,
    onResetInvertedScrollOwnership: options.onResetInvertedScrollOwnership,
    refreshEpoch: options.refreshEpoch,
    scrollViewport: options.scrollViewport,
  });
  const sharedOptions = buildFeedPaginationSharedOptions(
    options,
    canLoadMoreFromServer,
    controllers,
    maybeLoadNextPageRef,
  );
  useFeedPaginationEffects(sharedOptions);
  return useFeedPaginationRuntime(sharedOptions);
}

/**
 * Build the shared feed pagination options.
 * @param options - The options used to build the feed pagination options.
 * @param canLoadMoreFromServer - Whether can load more from server.
 * @param controllers - The pagination controllers.
 * @param maybeLoadNextPageRef - The shared ref storing the current load-more callback.
 * @returns The shared feed pagination options.
 */
function buildFeedPaginationSharedOptions(
  options: UseFeedPaginationOptions,
  canLoadMoreFromServer: boolean,
  controllers: ReturnType<typeof useFeedPaginationControllers>,
  maybeLoadNextPageRef: MaybeLoadNextPageRef,
) {
  return {
    ...options,
    canLoadMoreFromServer,
    controllers,
    maybeLoadNextPageRef,
  };
}
