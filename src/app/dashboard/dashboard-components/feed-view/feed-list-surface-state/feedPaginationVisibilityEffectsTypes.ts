import type { PaginationBoundaryUserIntentOptions } from "@/app/dashboard/dashboard-components/feed-view/feed-list-surface-state/paginationBoundaryState";
import type { PendingServerRevealLifecycleOptions } from "@/app/dashboard/dashboard-components/feed-view/feed-list-surface-state/pendingServerReveal";

export interface CollapsingArticlesRefSyncOptions {
  hasCollapsingArticles: boolean;
  hasCollapsingArticlesRef: { current: boolean };
}

export type FeedPaginationLoadingMoreRevealEffectOptions =
  PendingServerRevealLifecycleOptions & {
    canLoadMoreFromServer: boolean;
    filteredFeedLength: number;
    isLoadingMore: boolean;
    previousIsLoadingMoreRef: { current: boolean };
    visibleArticleCount: number;
  };

export interface FeedPaginationQueryResetEffectOptions {
  articleFilter: string;
  articlesPerPage: number;
  feedViewKey: string;
  isInvertedScroll: boolean;
  resetPaginationState: () => void;
  searchTerm: string;
  suppressNextInitialViewportAutoFillRef: { current: boolean };
  suppressNextRefreshViewportRefillRef: { current: boolean };
}

export interface FeedPaginationRefreshResetEffectOptions {
  articleFilter: string;
  articlesPerPage: number;
  hasUserScrolledRef: { current: boolean };
  isInvertedScroll: boolean;
  isLoadingMore: boolean;
  isRefreshing: boolean;
  isStandardViewportRefillActiveRef: { current: boolean };
  previousRefreshEpochRef: { current: number };
  refreshEpoch: number;
  resetPaginationState: () => void;
  standardViewportRefillTargetVisibleCountRef: { current: null | number };
  suppressNextRefreshViewportRefillRef: { current: boolean };
}

export type FeedPaginationRevealCountEffectOptions =
  PendingServerRevealLifecycleOptions & {
    commitVisibleArticleCount: (nextVisibleCount: number) => void;
    filteredFeedLength: number;
    hasRequestedServerLoadRef: { current: boolean };
    isLoadingMore: boolean;
    previousFilteredFeedLengthRef: { current: number };
    visibleArticleCountRef: { current: number };
  };

export interface InitialFeedPaginationAutoFillEffectOptions {
  filteredFeedLength: number;
  isInitialLoading: boolean;
  maybeAutoFillViewport: (
    committedListHeight?: number,
    allowOwnedTargetContinuationWithoutLocalBacklog?: boolean,
  ) => void;
  scrollViewport: HTMLElement | null;
  shouldUseVirtualizedFeed: boolean;
  suppressNextInitialViewportAutoFillRef: { current: boolean };
  visibleArticleCount: number;
}

export interface MountedFlagCleanupEffectOptions {
  isMountedRef: { current: boolean };
}

export interface NullableNumberRef {
  current: null | number;
}

export type RearmPaginationBoundaryFromUserIntentOptions =
  PaginationBoundaryUserIntentOptions;

export interface ResolvedStandardViewportRevealEffectOptions {
  filteredFeedLength: number;
  hasResolvedStandardViewportRevealRef: { current: boolean };
  isInvertedScroll: boolean;
  maybeAutoFillViewport: (
    committedListHeight?: number,
    allowOwnedTargetContinuationWithoutLocalBacklog?: boolean,
  ) => void;
}

export interface TimeoutHandleRef {
  current: null | ReturnType<typeof setTimeout>;
}

export interface VisibleArticleCountRefSyncOptions {
  visibleArticleCount: number;
  visibleArticleCountRef: { current: number };
}
