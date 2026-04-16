import { useCallback } from "react";

import type {
  InvertedPaginationAnchorState,
  UseFeedPaginationOptions,
} from "@/app/dashboard/dashboard-components/feed-view/feed-list-surface-state";
import type {
  FeedSurfaceMode,
  FeedViewportResolutionState,
  UseFeedListSurfaceStateOptions,
} from "@/app/dashboard/dashboard-components/feed-view/feed-list-surface-state/view-core";
import type {
  ArticleViewportSnapshot,
  CollapsingArticles,
} from "@/app/dashboard/display-types";

import {
  useFeedPagination,
  useFeedViewportState,
  useInvertedExpansionScrollLock,
  useInvertedScrollOwnership,
} from "@/app/dashboard/dashboard-components/feed-view/feed-list-surface-state";
import {
  buildFeedSurfacePresentationState,
  shouldAutoAnchorInvertedScrollViewport,
} from "@/app/dashboard/dashboard-components/feed-view/feed-list-surface-state/view-core";

type FeedSurfaceControllerOptions = Omit<
  UseFeedListSurfaceStateOptions,
  "invertedScrollAnchorIndex"
>;

export function buildFeedListSurfaceStateResult(options: {
  feedSurfaceMode: FeedSurfaceMode;
  filteredFeedLength: number;
  handleViewportHostRef: (node: HTMLDivElement | null) => void;
  hasSearchTerm: boolean;
  invertedPaginationAnchorRef: {
    current: InvertedPaginationAnchorState | null;
  };
  isInvertedScroll: boolean;
  loadMoreSentinelRef: (node: HTMLDivElement | null) => void;
  maybeAutoFillViewport: (committedListHeight?: number) => void;
  scrollViewport: HTMLElement | null;
  shouldAutoAnchor: () => boolean;
  shouldLockInitialNormalScroll: () => boolean;
  shouldShowViewportResolutionSkeleton: boolean;
  shouldUseVirtualizedFeed: boolean;
  syncInvertedExpansionScrollLock: () => void;
  syncInvertedPaginationAnchor: () => void;
  trimmedSearchTerm: string;
  visibleArticleCount: number;
}) {
  return {
    contentKey: `${options.feedSurfaceMode}:${options.trimmedSearchTerm}`,
    feedSurfaceMode: options.feedSurfaceMode,
    handleViewportHostRef: options.handleViewportHostRef,
    hasMoreArticles: options.visibleArticleCount < options.filteredFeedLength,
    hasSearchTerm: options.hasSearchTerm,
    invertedPaginationAnchorRef: options.invertedPaginationAnchorRef,
    isInvertedScroll: options.isInvertedScroll,
    loadMoreSentinelRef: options.loadMoreSentinelRef,
    maybeAutoFillViewport: options.maybeAutoFillViewport,
    scrollViewport: options.scrollViewport,
    shouldAutoAnchorInvertedScroll: options.shouldAutoAnchor,
    shouldLockInitialNormalScroll: options.shouldLockInitialNormalScroll,
    shouldShowViewportResolutionSkeleton:
      options.shouldShowViewportResolutionSkeleton,
    shouldUseVirtualizedFeed: options.shouldUseVirtualizedFeed,
    syncInvertedExpansionScrollLock: options.syncInvertedExpansionScrollLock,
    syncInvertedPaginationAnchor: options.syncInvertedPaginationAnchor,
    trimmedSearchTerm: options.trimmedSearchTerm,
    visibleArticleCount: options.visibleArticleCount,
  };
}

export function getFeedSurfacePresentation(options: {
  filteredFeedLength: number;
  isInitialLoading: boolean;
  searchTerm: string;
  shouldUseVirtualizedFeed: boolean;
  viewportResolutionState: FeedViewportResolutionState;
}) {
  return buildFeedSurfacePresentationState(options);
}

export function useFeedSurfaceAutoAnchor(options: {
  expandedArticleKey: null | string;
  hasClaimedInvertedScrollOwnershipRef: React.RefObject<boolean>;
  isInvertedScroll: boolean;
  shouldAnchorUnderfilledInvertedViewport: () => boolean;
}) {
  return useCallback(() => {
    const hasClaimedScrollOwnership =
      options.hasClaimedInvertedScrollOwnershipRef.current;

    return shouldAutoAnchorInvertedScrollViewport({
      expandedArticleKey: options.expandedArticleKey,
      hasClaimedInvertedScrollOwnership: hasClaimedScrollOwnership,
      isInvertedScroll: options.isInvertedScroll,
      isUnderfilledInvertedViewport:
        !hasClaimedScrollOwnership &&
        options.shouldAnchorUnderfilledInvertedViewport(),
    });
  }, [options]);
}

export function useFeedSurfaceComposition(
  options: FeedSurfaceControllerOptions,
) {
  const controllerState = useFeedSurfaceControllerStates(options);
  const { presentationState, shouldAutoAnchor } = useFeedSurfaceDerivedState({
    expandedArticleKey: options.expandedArticleKey,
    filteredFeedLength: options.filteredFeedLength,
    isInitialLoading: options.isInitialLoading,
    isInvertedScroll: options.isInvertedScroll,
    ownershipState: controllerState.ownershipState,
    paginationState: controllerState.paginationState,
    searchTerm: options.searchTerm,
    viewportState: controllerState.viewportState,
  });

  return buildFeedSurfaceCompositionResult({
    ...controllerState,
    presentationState,
    shouldAutoAnchor,
  });
}

export function useFeedSurfaceExpansionLock(
  options: Parameters<typeof useInvertedExpansionScrollLock>[0],
) {
  return useInvertedExpansionScrollLock(options);
}

export function useFeedSurfaceOwnership(scrollViewport: HTMLElement | null) {
  return useInvertedScrollOwnership(scrollViewport);
}

export function useFeedSurfacePagination(options: UseFeedPaginationOptions) {
  return useFeedPagination(options);
}

export function useFeedSurfaceViewportState(options: {
  feedViewKey: string;
  isCollapseScrollRestoreActive: boolean;
  isInvertedScroll: boolean;
  refreshEpoch: number;
}) {
  return useFeedViewportState(options);
}

function buildFeedSurfaceCompositionResult(options: {
  expansionLockState: ReturnType<typeof useFeedSurfaceExpansionLock>;
  ownershipState: ReturnType<typeof useFeedSurfaceOwnership>;
  paginationState: ReturnType<typeof useFeedSurfacePagination>;
  presentationState: ReturnType<typeof getFeedSurfacePresentation>;
  shouldAutoAnchor: ReturnType<typeof useFeedSurfaceAutoAnchor>;
  viewportState: ReturnType<typeof useFeedSurfaceViewportState>;
}) {
  return {
    expansionLockState: options.expansionLockState,
    ownershipState: options.ownershipState,
    paginationState: options.paginationState,
    presentationState: options.presentationState,
    shouldAutoAnchor: options.shouldAutoAnchor,
    viewportState: options.viewportState,
  };
}

function buildFeedSurfacePaginationCallbacks(options: {
  expansionLockState: ReturnType<typeof useFeedSurfaceExpansionLock>;
  onLoadMore?: () => void;
  ownershipState: ReturnType<typeof useFeedSurfaceOwnership>;
}) {
  return {
    onClaimInvertedScrollOwnership:
      options.ownershipState.claimInvertedScrollOwnership,
    onLoadMore: options.onLoadMore,
    onReleaseInvertedExpansionScrollLock:
      options.expansionLockState.releaseInvertedExpansionScrollLock,
    onResetInvertedScrollOwnership:
      options.ownershipState.resetInvertedScrollOwnership,
    onSyncInvertedExpansionScrollLock:
      options.expansionLockState.syncInvertedExpansionScrollLock,
  };
}

function buildFeedSurfacePaginationOptions(options: {
  articleFilter: string;
  articlesPerPage: number;
  canLoadMoreFromServer?: boolean;
  collapsingArticles: Readonly<Record<string, unknown>>;
  expansionLockState: ReturnType<typeof useFeedSurfaceExpansionLock>;
  feedViewKey: string;
  filteredFeedLength: number;
  isInitialLoading: boolean;
  isInvertedScroll: boolean;
  isLoadingMore: boolean;
  isRefreshing: boolean;
  onLoadMore?: () => void;
  ownershipState: ReturnType<typeof useFeedSurfaceOwnership>;
  refreshEpoch: number;
  searchTerm: string;
  viewportState: ReturnType<typeof useFeedSurfaceViewportState>;
}) {
  const paginationCallbacks = buildFeedSurfacePaginationCallbacks(options);

  return {
    articleFilter: options.articleFilter,
    articlesPerPage: options.articlesPerPage,
    canLoadMoreFromServer: options.canLoadMoreFromServer,
    clearInitialNormalScrollLock:
      options.viewportState.clearInitialNormalScrollLock,
    feedViewKey: options.feedViewKey,
    filteredFeedLength: options.filteredFeedLength,
    hasActiveInvertedExpansionScrollLock:
      options.expansionLockState.hasActiveInvertedExpansionScrollLock,
    hasCollapsingArticles: Object.keys(options.collapsingArticles).length > 0,
    hasUserScrolledRef: options.ownershipState.hasUserScrolledRef,
    isInitialLoading: options.isInitialLoading,
    isInvertedScroll: options.isInvertedScroll,
    isLoadingMore: options.isLoadingMore,
    isRefreshing: options.isRefreshing,
    ...paginationCallbacks,
    refreshEpoch: options.refreshEpoch,
    scrollViewport: options.viewportState.scrollViewport,
    searchTerm: options.searchTerm,
    shouldLockInitialNormalScroll:
      options.viewportState.shouldLockInitialNormalScroll,
  };
}

function useFeedSurfaceBaseStates(options: {
  articleFilter: string;
  collapsingArticles: Readonly<CollapsingArticles>;
  expandedArticleKey: null | string;
  feedViewKey: string;
  getPreExpandViewportSnapshot: (
    articleKey: string,
  ) => ArticleViewportSnapshot | null;
  isCollapseScrollRestoreActive: boolean;
  isInvertedScroll: boolean;
  refreshEpoch: number;
}) {
  const viewportState = useFeedSurfaceViewportState({
    feedViewKey: options.feedViewKey,
    isCollapseScrollRestoreActive: options.isCollapseScrollRestoreActive,
    isInvertedScroll: options.isInvertedScroll,
    refreshEpoch: options.refreshEpoch,
  });
  const ownershipState = useFeedSurfaceOwnership(viewportState.scrollViewport);
  const expansionLockState = useFeedSurfaceExpansionLock({
    articleFilter: options.articleFilter,
    collapsingArticles: options.collapsingArticles,
    expandedArticleKey: options.expandedArticleKey,
    getPreExpandViewportSnapshot: options.getPreExpandViewportSnapshot,
    isInvertedScroll: options.isInvertedScroll,
    onClaimInvertedScrollOwnership: ownershipState.claimInvertedScrollOwnership,
    scrollViewport: viewportState.scrollViewport,
  });

  return { expansionLockState, ownershipState, viewportState };
}

function useFeedSurfaceControllerStates(options: FeedSurfaceControllerOptions) {
  const { expansionLockState, ownershipState, viewportState } =
    useFeedSurfaceBaseStates(options);
  const paginationState = useFeedSurfacePagination(
    buildFeedSurfacePaginationOptions({
      articleFilter: options.articleFilter,
      articlesPerPage: options.articlesPerPage,
      canLoadMoreFromServer: options.canLoadMoreFromServer,
      collapsingArticles: options.collapsingArticles,
      expansionLockState,
      feedViewKey: options.feedViewKey,
      filteredFeedLength: options.filteredFeedLength,
      isInitialLoading: options.isInitialLoading,
      isInvertedScroll: options.isInvertedScroll,
      isLoadingMore: options.isLoadingMore,
      isRefreshing: options.isRefreshing,
      onLoadMore: options.onLoadMore,
      ownershipState,
      refreshEpoch: options.refreshEpoch,
      searchTerm: options.searchTerm,
      viewportState,
    }),
  );

  return { expansionLockState, ownershipState, paginationState, viewportState };
}

function useFeedSurfaceDerivedState(options: {
  expandedArticleKey: null | string;
  filteredFeedLength: number;
  isInitialLoading: boolean;
  isInvertedScroll: boolean;
  ownershipState: ReturnType<typeof useFeedSurfaceOwnership>;
  paginationState: ReturnType<typeof useFeedSurfacePagination>;
  searchTerm: string;
  viewportState: ReturnType<typeof useFeedSurfaceViewportState>;
}) {
  const presentationState = getFeedSurfacePresentation({
    filteredFeedLength: options.filteredFeedLength,
    isInitialLoading: options.isInitialLoading,
    searchTerm: options.searchTerm,
    shouldUseVirtualizedFeed: options.paginationState.shouldUseVirtualizedFeed,
    viewportResolutionState: options.viewportState.viewportResolutionState,
  });
  const shouldAutoAnchor = useFeedSurfaceAutoAnchor({
    expandedArticleKey: options.expandedArticleKey,
    hasClaimedInvertedScrollOwnershipRef:
      options.ownershipState.hasClaimedInvertedScrollOwnershipRef,
    isInvertedScroll: options.isInvertedScroll,
    shouldAnchorUnderfilledInvertedViewport:
      options.ownershipState.shouldAnchorUnderfilledInvertedViewport,
  });

  return { presentationState, shouldAutoAnchor };
}
