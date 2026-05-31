import { useCallback } from "react";

import type { Article } from "@/lib/core";

import { FeedArticleRow } from "@/app/dashboard/components/feed-view/FeedArticleRow";
import { type CollapsingArticles } from "@/app/dashboard/display-types";
import { getArticleKey } from "@/app/dashboard/services/article-collection";
import { type DashboardArticleViewMode } from "@/app/dashboard/services/dashboard-view-mode";

/** Options used to build the FeedList article-row renderer. */
interface UseFeedRowRendererOptions {
  animatingInArticleKeys?: ReadonlySet<string>;
  articleViewMode: DashboardArticleViewMode;
  collapsingArticles: Readonly<CollapsingArticles>;
  expandedArticleKey: null | string;
  hydratedArticleLinks: Record<string, boolean>;
  hydratingArticleLinks: Record<string, boolean>;
  isBelowDesktop: boolean;
  isDark: boolean;
  lastFeedArticleKey: null | string;
  onEnteringDone?: (articleKey: string) => void;
  onExpandedSwipeRead: (article: Article) => void;
  onPrepareExpand?: (article: Article) => void;
  onSwipeRead?: (article: Article) => void;
  onToggle: (article: Article) => void;
  onToggleRead: (article: Article) => void;
  onToggleStarred: (article: Article) => void;
  showFavicons: boolean;
  updatingArticleState: Record<string, boolean>;
}

/**
 * Build the stable article-row renderer used by FeedList.
 * @param options - Row state and callbacks forwarded from FeedList.
 * @returns A stable renderer for feed article rows.
 */
export function useFeedRowRenderer(options: UseFeedRowRendererOptions) {
  const {
    animatingInArticleKeys,
    articleViewMode,
    collapsingArticles,
    expandedArticleKey,
    hydratedArticleLinks,
    hydratingArticleLinks,
    isBelowDesktop,
    isDark,
    lastFeedArticleKey,
    onEnteringDone,
    onExpandedSwipeRead,
    onPrepareExpand,
    onSwipeRead,
    onToggle,
    onToggleRead,
    onToggleStarred,
    showFavicons,
    updatingArticleState,
  } = options;

  return useCallback(
    (article: Article) => {
      const articleKey = getArticleKey(article);
      return (
        <FeedArticleRow
          article={article}
          articleKey={articleKey}
          articleViewMode={articleViewMode}
          hasScrapedContent={Boolean(article.hasFullContent)}
          isDark={isDark}
          isEntering={animatingInArticleKeys?.has(articleKey) ?? false}
          isExpanded={expandedArticleKey === articleKey}
          isHydrating={hydratingArticleLinks[article.link] ?? false}
          isLastRow={articleKey === lastFeedArticleKey}
          isMobile={isBelowDesktop}
          isUpdatingState={updatingArticleState[articleKey] ?? false}
          key={articleKey}
          onEnteringDone={onEnteringDone}
          onExpandedSwipeRead={onExpandedSwipeRead}
          onPrepareExpand={onPrepareExpand}
          onSwipeRead={onSwipeRead}
          onToggle={onToggle}
          onToggleRead={onToggleRead}
          onToggleStarred={onToggleStarred}
          removalAnimationMode={collapsingArticles[articleKey]?.mode ?? null}
          showFavicons={showFavicons}
          useRichFormatting={hydratedArticleLinks[article.link] ?? false}
        />
      );
    },
    [
      animatingInArticleKeys,
      articleViewMode,
      collapsingArticles,
      expandedArticleKey,
      hydratedArticleLinks,
      hydratingArticleLinks,
      isDark,
      isBelowDesktop,
      lastFeedArticleKey,
      onEnteringDone,
      onExpandedSwipeRead,
      onPrepareExpand,
      onSwipeRead,
      onToggle,
      onToggleRead,
      onToggleStarred,
      showFavicons,
      updatingArticleState,
    ],
  );
}
