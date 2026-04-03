import { type Article } from "@/lib";

import {
  type ArticleRemovalAnimationMode,
  type ArticleViewportSnapshot,
  type CollapsingArticles,
} from "../../hooks/useArticleCollapseState";
import { type ArticleFilter } from "../../services/article-filters";
import { ArticleCard } from "../ArticleCard";

export interface FeedArticleRowProps
  extends Omit<FeedArticleCardProps, "showFavicon"> {
  /** Whether this row's entrance animation is currently running. */
  isEntering?: boolean;
  isLastRow: boolean;
  /** Stable callback invoked when the row's entrance animation settles. */
  onEnteringDone?: (articleKey: string) => void;
  showFavicons: boolean;
}

export interface FeedListProps {
  /** Set of article keys whose entrance animation is currently running. */
  animatingInArticleKeys?: ReadonlySet<string>;
  articleFilter: ArticleFilter;
  articlesPerPage: number;
  canLoadMoreFromServer?: boolean;
  collapsingArticles?: Readonly<CollapsingArticles>;
  expandedArticleKey: null | string;
  feedViewKey: string;
  filteredFeed: Article[];
  getPreExpandViewportSnapshot?: (articleKey: string) => ArticleViewportSnapshot | null;
  hasConfiguredFeeds?: boolean;
  hydratedArticleLinks: Record<string, boolean>;
  hydratingArticleLinks: Record<string, boolean>;
  isCollapseScrollRestoreActive?: boolean;
  isInitialLoading: boolean;
  isLoadingMore?: boolean;
  isRefreshing: boolean;
  loadingMoreArticleCount?: number;
  /** Stable callback invoked when a specific article's entrance animation settles. */
  onEnteringDone?: (articleKey: string) => void;
  onExpandedSwipeRead: (article: Article) => void;
  onLoadMore?: () => void;
  onPrepareExpand?: (article: Article) => void;
  onSwipeRead?: (article: Article) => void;
  onToggle: (article: Article) => void;
  onToggleRead: (article: Article) => void;
  onToggleStarred: (article: Article) => void;
  refreshEpoch?: number;
  searchTerm: string;
  showFavicons: boolean;
  updatingArticleState: Record<string, boolean>;
}

export interface FeedListRowProps {
  articleKey: string;
  children: React.ReactNode;
  hasTrailingGap: boolean;
  /** Whether this row's entrance animation is currently running. */
  isEntering?: boolean;
  isExpanded?: boolean;
  /** Stable callback invoked when the row's entrance animation settles. */
  onEnteringDone?: (articleKey: string) => void;
  removalAnimationMode: ArticleRemovalAnimationMode | null;
}

type FeedArticleCardProps = React.ComponentProps<typeof ArticleCard>;