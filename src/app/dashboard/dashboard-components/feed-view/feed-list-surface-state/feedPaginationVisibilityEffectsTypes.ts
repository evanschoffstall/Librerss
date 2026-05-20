import type { PaginationBoundaryUserIntentOptions } from "@/app/dashboard/dashboard-components/feed-view/feed-list-surface-state/paginationBoundaryState";
import type { PendingServerRevealLifecycleOptions } from "@/app/dashboard/dashboard-components/feed-view/feed-list-surface-state/pendingServerReveal";

/**
 * Describes the options for collapsing articles ref sync.
 */
export interface CollapsingArticlesRefSyncOptions {
  hasCollapsingArticles: boolean;
  hasCollapsingArticlesRef: { current: boolean };
}

/**
 * Describes the options for feed pagination loading more reveal effect.
 */
export type FeedPaginationLoadingMoreRevealEffectOptions =
  PendingServerRevealLifecycleOptions & {
    canLoadMoreFromServer: boolean;
    filteredFeedLength: number;
    isLoadingMore: boolean;
    previousIsLoadingMoreRef: { current: boolean };
    visibleArticleCount: number;
  };

/**
 * Describes the options for feed pagination query reset effect.
 */
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

/**
 * Describes the options for feed pagination refresh reset effect.
 */
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

/**
 * Describes the options for feed pagination reveal count effect.
 */
export type FeedPaginationRevealCountEffectOptions =
  PendingServerRevealLifecycleOptions & {
    commitVisibleArticleCount: (nextVisibleCount: number) => void;
    filteredFeedLength: number;
    hasRequestedServerLoadRef: { current: boolean };
    isLoadingMore: boolean;
    previousFilteredFeedLengthRef: { current: number };
    visibleArticleCountRef: { current: number };
  };

/**
 * Describes the options for recovering feed pagination after a stale browser resume.
 */
export interface FeedPaginationStaleResumeResetEffectOptions {
  isInvertedScroll: boolean;
  resetPaginationState: () => void;
  scrollViewport: HTMLElement | null;
}

/**
 * Describes the options for initial feed pagination auto fill effect.
 */
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

/**
 * Describes the options for mounted flag cleanup effect.
 */
export interface MountedFlagCleanupEffectOptions {
  isMountedRef: { current: boolean };
}

/**
 * Describes the nullable number ref.
 */
export interface NullableNumberRef {
  current: null | number;
}

/**
 * Describes the options for rearm pagination boundary from user intent.
 */
export type RearmPaginationBoundaryFromUserIntentOptions =
  PaginationBoundaryUserIntentOptions;

/**
 * Describes the options for resolved standard viewport reveal effect.
 */
export interface ResolvedStandardViewportRevealEffectOptions {
  filteredFeedLength: number;
  hasResolvedStandardViewportRevealRef: { current: boolean };
  isInvertedScroll: boolean;
  maybeAutoFillViewport: (
    committedListHeight?: number,
    allowOwnedTargetContinuationWithoutLocalBacklog?: boolean,
  ) => void;
}

/**
 * Describes the timeout handle ref.
 */
export interface TimeoutHandleRef {
  current: null | ReturnType<typeof setTimeout>;
}

/**
 * Describes the options for visible article count ref sync.
 */
export interface VisibleArticleCountRefSyncOptions {
  visibleArticleCount: number;
  visibleArticleCountRef: { current: number };
}
