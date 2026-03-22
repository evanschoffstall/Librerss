import { memo } from "react";

import { ArticleCard } from "../ArticleCard";
import { type FeedArticleRowProps } from "./FeedList.types";
import { FeedListRow } from "./FeedListRow";

function areFeedArticleRowPropsEqual(
  previousProps: FeedArticleRowProps,
  nextProps: FeedArticleRowProps,
) {
  return (
    previousProps.article === nextProps.article &&
    previousProps.articleKey === nextProps.articleKey &&
    previousProps.hasScrapedContent === nextProps.hasScrapedContent &&
    previousProps.isDark === nextProps.isDark &&
    previousProps.isExpanded === nextProps.isExpanded &&
    previousProps.isHydrating === nextProps.isHydrating &&
    previousProps.isMobile === nextProps.isMobile &&
    previousProps.isUpdatingState === nextProps.isUpdatingState &&
    previousProps.onExpandedSwipeRead === nextProps.onExpandedSwipeRead &&
    previousProps.onPrepareExpand === nextProps.onPrepareExpand &&
    previousProps.onSwipeRead === nextProps.onSwipeRead &&
    previousProps.onToggle === nextProps.onToggle &&
    previousProps.onToggleRead === nextProps.onToggleRead &&
    previousProps.onToggleStarred === nextProps.onToggleStarred &&
    previousProps.removalAnimationMode === nextProps.removalAnimationMode &&
    previousProps.showFavicons === nextProps.showFavicons &&
    previousProps.useRichFormatting === nextProps.useRichFormatting
  );
}

export const FeedArticleRow = memo(function FeedArticleRow({
  article,
  articleKey,
  hasScrapedContent,
  isDark,
  isExpanded,
  isHydrating,
  isMobile,
  isUpdatingState,
  onExpandedSwipeRead,
  onPrepareExpand,
  onSwipeRead,
  onToggle,
  onToggleRead,
  onToggleStarred,
  removalAnimationMode = null,
  showFavicons,
  useRichFormatting,
}: FeedArticleRowProps) {
  return (
    <FeedListRow
      articleKey={articleKey}
      removalAnimationMode={removalAnimationMode}
    >
      <ArticleCard
        article={article}
        articleKey={articleKey}
        hasScrapedContent={hasScrapedContent}
        isDark={isDark}
        isExpanded={isExpanded}
        isHydrating={isHydrating}
        isMobile={isMobile}
        isUpdatingState={isUpdatingState}
        onExpandedSwipeRead={onExpandedSwipeRead}
        onPrepareExpand={onPrepareExpand}
        onSwipeRead={onSwipeRead}
        onToggle={onToggle}
        onToggleRead={onToggleRead}
        onToggleStarred={onToggleStarred}
        removalAnimationMode={removalAnimationMode}
        showFavicon={showFavicons}
        useRichFormatting={useRichFormatting}
      />
    </FeedListRow>
  );
}, areFeedArticleRowPropsEqual);