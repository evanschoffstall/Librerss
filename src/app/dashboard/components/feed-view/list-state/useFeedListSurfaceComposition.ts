import { useCallback } from "react";

import type {
  InvertedPaginationAnchorState,
  UseFeedPaginationOptions,
} from "@/app/dashboard/components/feed-view/feed-list-surface-state";
import type {
  FeedSurfaceMode,
  FeedViewportResolutionState,
  UseFeedListSurfaceStateOptions,
} from "@/app/dashboard/components/feed-view/feed-list-surface-state/view-core";
import type {
  ArticleViewportSnapshot,
  CollapsingArticles,
} from "@/app/dashboard/display-types";

import {
  useFeedPagination,
  useFeedViewportState,
  useInvertedExpansionScrollLock,
  useInvertedScrollOwnership,
} from "@/app/dashboard/components/feed-view/feed-list-surface-state";
import {
  buildFeedSurfacePresentationState,
  shouldAutoAnchorInvertedScrollViewport,
} from "@/app/dashboard/components/feed-view/feed-list-surface-state/view-core";

/**
 * Describes the options for feed list surface state result.
 */
interface FeedListSurfaceStateResultOptions {
  feedSurfaceMode: FeedSurfaceMode;
  filteredFeedLength: number;
  handleViewportHostRef: (node: HTMLDivElement | null) => void;
  hasActiveInvertedExpansionScrollLock: () => boolean;
  hasSearchTerm: boolean;
  invertedPaginationAnchorRef: {
    current: InvertedPaginationAnchorState | null;
  };
  isCachedPageRevealing: boolean;
  isInvertedScroll: boolean;
  isPendingServerRevealVisible: boolean;
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
}
/**
 * Describes the options for feed surface auto anchor.
 */
interface FeedSurfaceAutoAnchorOptions {
  expandedArticleKey: null | string;
  hasClaimedInvertedScrollOwnershipRef: React.RefObject<boolean>;
  isInvertedScroll: boolean;
  shouldAnchorUnderfilledInvertedViewport: () => boolean;
}

/**
 * Describes the options for feed surface base states.
 */
interface FeedSurfaceBaseStatesOptions {
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
}
/**
 * Describes the options for feed surface composition result.
 */
interface FeedSurfaceCompositionResultOptions {
  expansionLockState: ReturnType<typeof useFeedSurfaceExpansionLock>;
  ownershipState: ReturnType<typeof useFeedSurfaceOwnership>;
  paginationState: ReturnType<typeof useFeedSurfacePagination>;
  presentationState: ReturnType<typeof getFeedSurfacePresentation>;
  shouldAutoAnchor: ReturnType<typeof useFeedSurfaceAutoAnchor>;
  viewportState: ReturnType<typeof useFeedSurfaceViewportState>;
}

/**
 * Describes the options for feed surface controller.
 */
type FeedSurfaceControllerOptions = Omit<
  UseFeedListSurfaceStateOptions,
  "invertedScrollAnchorIndex"
>;
/**
 * Describes the options for feed surface derived state.
 */
interface FeedSurfaceDerivedStateOptions {
  expandedArticleKey: null | string;
  filteredFeedLength: number;
  isInitialLoading: boolean;
  isInvertedScroll: boolean;
  ownershipState: ReturnType<typeof useFeedSurfaceOwnership>;
  paginationState: ReturnType<typeof useFeedSurfacePagination>;
  searchTerm: string;
  viewportState: ReturnType<typeof useFeedSurfaceViewportState>;
}

/**
 * Describes the options for feed surface pagination callbacks.
 */
interface FeedSurfacePaginationCallbacksOptions {
  expansionLockState: ReturnType<typeof useFeedSurfaceExpansionLock>;
  onLoadMore?: () => void;
  ownershipState: ReturnType<typeof useFeedSurfaceOwnership>;
}

/**
 * Describes the options for feed surface pagination options.
 */
interface FeedSurfacePaginationOptionsOptions {
  articleFilter: string;
  articlesPerPage: number;
  canLoadMoreFromServer?: boolean;
  collapsingArticles: Readonly<Record<string, unknown>>;
  expandedArticleKey: null | string;
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
}

/**
 * Describes the options for feed surface presentation.
 */
interface FeedSurfacePresentationOptions {
  filteredFeedLength: number;
  isInitialLoading: boolean;
  searchTerm: string;
  shouldUseVirtualizedFeed: boolean;
  viewportResolutionState: FeedViewportResolutionState;
}

/**
 * Describes the options for feed surface viewport state.
 */
interface FeedSurfaceViewportStateOptions {
  feedViewKey: string;
  isCollapseScrollRestoreActive: boolean;
  isInvertedScroll: boolean;
  refreshEpoch: number;
}

/**
 * Build the feed list surface state result.
 * @param options - The options used to build the feed list surface state result.
 * @returns The feed list surface state result.
 */
export function buildFeedListSurfaceStateResult(
  options: FeedListSurfaceStateResultOptions,
) {
  return {
    contentKey: `${options.feedSurfaceMode}:${options.trimmedSearchTerm}`,
    feedSurfaceMode: options.feedSurfaceMode,
    handleViewportHostRef: options.handleViewportHostRef,
    hasActiveInvertedExpansionScrollLock:
      options.hasActiveInvertedExpansionScrollLock,
    hasMoreArticles: options.visibleArticleCount < options.filteredFeedLength,
    hasSearchTerm: options.hasSearchTerm,
    invertedPaginationAnchorRef: options.invertedPaginationAnchorRef,
    isCachedPageRevealing: options.isCachedPageRevealing,
    isInvertedScroll: options.isInvertedScroll,
    isPendingServerRevealVisible: options.isPendingServerRevealVisible,
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
/**
 * Return the feed surface presentation.
 * @param options - The options used to return the feed surface presentation.
 * @returns The feed surface presentation.
 */
export function getFeedSurfacePresentation(
  options: FeedSurfacePresentationOptions,
) {
  return buildFeedSurfacePresentationState(options);
}

/**
 * Manage the feed surface auto anchor.
 * @param options - The options used to manage the feed surface auto anchor.
 * @returns The feed surface auto anchor state and callbacks.
 */
export function useFeedSurfaceAutoAnchor(
  options: FeedSurfaceAutoAnchorOptions,
) {
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
/**
 * Manage the feed surface composition.
 * @param options - The options used to manage the feed surface composition.
 * @returns The feed surface composition state and callbacks.
 */
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

/**
 * Manage the feed surface expansion lock.
 * @param options - The options used to manage the feed surface expansion lock.
 * @returns The feed surface expansion lock state and callbacks.
 */
export function useFeedSurfaceExpansionLock(
  options: Parameters<typeof useInvertedExpansionScrollLock>[0],
) {
  return useInvertedExpansionScrollLock(options);
}
/**
 * Manage the feed surface ownership.
 * @param scrollViewport - The scroll viewport.
 * @returns The feed surface ownership state and callbacks.
 */
export function useFeedSurfaceOwnership(scrollViewport: HTMLElement | null) {
  return useInvertedScrollOwnership(scrollViewport);
}

/**
 * Manage the feed surface pagination.
 * @param options - The options used to manage the feed surface pagination.
 * @returns The feed surface pagination state and callbacks.
 */
export function useFeedSurfacePagination(options: UseFeedPaginationOptions) {
  return useFeedPagination(options);
}
/**
 * Manage the feed surface viewport state.
 * @param options - The options used to manage the feed surface viewport state.
 * @returns The feed surface viewport state and callbacks.
 */
export function useFeedSurfaceViewportState(
  options: FeedSurfaceViewportStateOptions,
) {
  return useFeedViewportState(options);
}

/**
 * Build the feed surface composition result.
 * @param options - The options used to build the feed surface composition result.
 * @returns The feed surface composition result.
 */
function buildFeedSurfaceCompositionResult(
  options: FeedSurfaceCompositionResultOptions,
) {
  return {
    expansionLockState: options.expansionLockState,
    ownershipState: options.ownershipState,
    paginationState: options.paginationState,
    presentationState: options.presentationState,
    shouldAutoAnchor: options.shouldAutoAnchor,
    viewportState: options.viewportState,
  };
}
/**
 * Build the feed surface pagination callbacks.
 * @param options - The options used to build the feed surface pagination callbacks.
 * @returns The feed surface pagination callbacks.
 */
function buildFeedSurfacePaginationCallbacks(
  options: FeedSurfacePaginationCallbacksOptions,
) {
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

/**
 * Build the feed surface pagination options.
 * @param options - The options used to build the feed surface pagination options.
 * @returns The feed surface pagination options.
 */
function buildFeedSurfacePaginationOptions(
  options: FeedSurfacePaginationOptionsOptions,
) {
  const paginationCallbacks = buildFeedSurfacePaginationCallbacks(options);

  return {
    articleFilter: options.articleFilter,
    articlesPerPage: options.articlesPerPage,
    canLoadMoreFromServer: options.canLoadMoreFromServer,
    clearInitialNormalScrollLock:
      options.viewportState.clearInitialNormalScrollLock,
    expandedArticleKey: options.expandedArticleKey,
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

/**
 * Manage the feed surface base states.
 * @param options - The options used to manage the feed surface base states.
 * @returns The feed surface base states state and callbacks.
 */
function useFeedSurfaceBaseStates(options: FeedSurfaceBaseStatesOptions) {
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
/**
 * Manage the feed surface controller states.
 * @param options - The options used to manage the feed surface controller states.
 * @returns The feed surface controller states state and callbacks.
 */
function useFeedSurfaceControllerStates(options: FeedSurfaceControllerOptions) {
  const { expansionLockState, ownershipState, viewportState } =
    useFeedSurfaceBaseStates(options);
  const paginationState = useFeedSurfacePagination(
    buildFeedSurfacePaginationOptions({
      articleFilter: options.articleFilter,
      articlesPerPage: options.articlesPerPage,
      canLoadMoreFromServer: options.canLoadMoreFromServer,
      collapsingArticles: options.collapsingArticles,
      expandedArticleKey: options.expandedArticleKey,
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

/**
 * Manage the feed surface derived state.
 * @param options - The options used to manage the feed surface derived state.
 * @returns The feed surface derived state and callbacks.
 */
function useFeedSurfaceDerivedState(options: FeedSurfaceDerivedStateOptions) {
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
