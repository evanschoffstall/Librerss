import { type Article } from "@/lib";

import { type ArticleRemovalAnimationMode, type CollapsingArticles } from "../../hooks/useArticleCollapseState";
import { type ArticleFilter } from "../../services/article-filters";
import { ArticleCard } from "../ArticleCard";

export interface FeedArticleRowProps
  extends Omit<FeedArticleCardProps, "showFavicon"> {
  showFavicons: boolean;
}

export interface FeedListProps {
  articleFilter: ArticleFilter;
  articlesPerPage: number;
  collapsingArticles?: Readonly<CollapsingArticles>;
  expandedArticleKey: null | string;
  feedViewKey: string;
  filteredFeed: Article[];
  hydratedArticleLinks: Record<string, boolean>;
  hydratingArticleLinks: Record<string, boolean>;
  isCollapseScrollRestoreActive?: boolean;
  isInitialLoading: boolean;
  isRefreshing: boolean;
  onExpandedSwipeRead: (article: Article) => void;
  onPrepareExpand?: (article: Article) => void;
  onSwipeRead?: (article: Article) => void;
  onToggle: (article: Article) => void;
  onToggleRead: (article: Article) => void;
  onToggleStarred: (article: Article) => void;
  searchTerm: string;
  showFavicons: boolean;
  updatingArticleState: Record<string, boolean>;
}

export interface FeedListRowProps {
  articleKey: string;
  children: React.ReactNode;
  removalAnimationMode: ArticleRemovalAnimationMode | null;
}

type FeedArticleCardProps = React.ComponentProps<typeof ArticleCard>;