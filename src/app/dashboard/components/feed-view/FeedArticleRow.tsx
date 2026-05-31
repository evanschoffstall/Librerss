import { memo } from "react";

import { ArticleCard } from "@/app/dashboard/components/article-view";
import { type FeedArticleRowProps } from "@/app/dashboard/components/feed-view/FeedList.types";
import { FeedListRow } from "@/app/dashboard/components/feed-view/FeedListRow";

const FEED_ARTICLE_ROW_PROP_KEYS = [
  "article",
  "articleKey",
  "articleViewMode",
  "hasScrapedContent",
  "isDark",
  "isEntering",
  "isExpanded",
  "isHydrating",
  "isLastRow",
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
 * Process the are feed article row props equal.
 * @param previousProps - The previous props.
 * @param nextProps - The next props.
 * @returns Whether are feed article row props equal.
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
   * Renders one memoized article row inside the virtualized feed list.
   * @param props - Row props forwarded to the list row shell and article card.
   * @returns The rendered feed row.
   */
  function FeedArticleRow(props: FeedArticleRowProps) {
    const {
      article,
      articleKey,
      articleViewMode,
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
    } = props;

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
          articleViewMode={articleViewMode}
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
