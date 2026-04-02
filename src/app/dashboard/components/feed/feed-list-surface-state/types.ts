import { type ArticleViewportSnapshot, type CollapsingArticles } from "../../../hooks/useArticleCollapseState";

/** Custom expand events emitted by article rows before the expansion transition starts. */
export interface ArticleExpandPreparedDetail {
  articleKey: string;
}

/** Available feed surface rendering strategies. */
export type FeedSurfaceMode = "empty" | "plain" | "skeleton" | "virtualized";

/** Tracks whether the Radix ScrollArea viewport has been discovered yet. */
export type FeedViewportResolutionState = "missing" | "pending" | "ready";

/** Lifecycle states for the inverted expansion scroll lock. */
export type InvertedExpansionScrollLockMode =
  | "collapsing"
  | "expand"
  | "restore"
  | "stable";

/** Observer wiring required to keep the inverted expansion lock synchronized. */
export interface InvertedExpansionScrollLockObserverOptions {
  articleKey: null | string;
  onLayoutChange: () => void;
  viewport: HTMLElement;
}

/** Active scroll lock state for inverted feeds during expand and collapse transitions. */
export interface InvertedExpansionScrollLockState {
  anchorViewportOffsetTop: number;
  animationFrameId: number;
  articleKey: null | string;
  baselineScrollTop: number;
  disconnectLayoutObservers: (() => void) | null;
  mode: InvertedExpansionScrollLockMode;
  /**
   * When true the lock pins scrollTop to the viewport's current maxScrollTop
   * each sync tick instead of using a fixed baselineScrollTop. Used when all
   * visible articles are collapsed at once (no survivor anchor) so the user
   * stays at the bottom as backfills prepend older articles above.
   */
  pinToBottom: boolean;
  releaseAt: null | number;
  viewport: HTMLElement;
  viewportOverflowAnchor: string;
}

/** Snapshot captured before inverted expansion mutates the row height. */
export interface InvertedExpansionViewportSnapshot {
  articleHeaderViewportOffsetTop: number;
  articleKey: string;
  viewport: HTMLElement;
  viewportScrollTop: number;
}

/** Tracks the unread-removal animation that was primed by a direct interaction. */
export interface PrimedUnreadRemovalState {
  articleKeys: ReadonlySet<string>;
  expiresAt: number;
}

/** Inputs required to decide whether inverted mode should keep the newest item pinned. */
export interface ShouldAutoAnchorInvertedScrollViewportOptions {
  expandedArticleKey: null | string;
  hasClaimedInvertedScrollOwnership: boolean;
  isInvertedScroll: boolean;
  isUnderfilledInvertedViewport: boolean;
}

/** Public inputs for the feed surface state coordinator. */
export interface UseFeedListSurfaceStateOptions {
  articleFilter: string;
  articlesPerPage: number;
  canLoadMoreFromServer?: boolean;
  collapsingArticles: Readonly<CollapsingArticles>;
  expandedArticleKey: null | string;
  feedViewKey: string;
  filteredFeedLength: number;
  getPreExpandViewportSnapshot: (articleKey: string) => ArticleViewportSnapshot | null;
  invertedScrollAnchorIndex: number;
  isCollapseScrollRestoreActive: boolean;
  isInitialLoading: boolean;
  isInvertedScroll: boolean;
  isLoadingMore: boolean;
  onLoadMore?: () => void;
  refreshEpoch: number;
  searchTerm: string;
}