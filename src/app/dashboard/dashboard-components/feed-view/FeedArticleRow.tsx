import { memo } from "react";

import { ArticleCard } from "@/app/dashboard/dashboard-components/article-view";
import { type FeedArticleRowProps } from "@/app/dashboard/dashboard-components/feed-view/FeedList.types";
import { FeedListRow } from "@/app/dashboard/dashboard-components/feed-view/FeedListRow";

const FEED_ARTICLE_ROW_PROP_KEYS = [
  "article",
  "articleKey",
  "hasScrapedContent",
  "isDark",
  "isEntering",
  "isExpanded",
  "isHydrating",
  "isMobile",
  "isUpdatingState",
  "onEnteringDone",
  "onExpandedSwipeRead",
  "onPrepareExpand",
  "onSwipeRead",
  "onToggle",
  "onToggleRead",
  "onToggleStarred",
  "removalAnimationMode",
  "showFavicons",
  "useRichFormatting",
] as const satisfies readonly (keyof FeedArticleRowProps)[];

/**
 * @param previousProps
 * @param nextProps
 */
function areFeedArticleRowPropsEqual(
  previousProps: FeedArticleRowProps,
  nextProps: FeedArticleRowProps,
) {
  return FEED_ARTICLE_ROW_PROP_KEYS.every(
    (key) => previousProps[key] === nextProps[key],
  );
}

export const FeedArticleRow = memo(
  /**
   * @param root0
   * @param root0.article
   * @param root0.articleKey
   * @param root0.hasScrapedContent
   * @param root0.isDark
   * @param root0.isEntering
   * @param root0.isExpanded
   * @param root0.isHydrating
   * @param root0.isLastRow
   * @param root0.isMobile
   * @param root0.isUpdatingState
   * @param root0.onEnteringDone
   * @param root0.onExpandedSwipeRead
   * @param root0.onPrepareExpand
   * @param root0.onSwipeRead
   * @param root0.onToggle
   * @param root0.onToggleRead
   * @param root0.onToggleStarred
   * @param root0.removalAnimationMode
   * @param root0.showFavicons
   * @param root0.useRichFormatting
   */
  function FeedArticleRow({
    article,
    articleKey,
    hasScrapedContent,
    isDark,
    isEntering,
    isExpanded,
    isHydrating,
    isLastRow,
    isMobile,
    isUpdatingState,
    onEnteringDone,
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
        hasTrailingGap={!isLastRow}
        isEntering={isEntering}
        isExpanded={isExpanded}
        onEnteringDone={onEnteringDone}
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
  },
  areFeedArticleRowPropsEqual,
);
