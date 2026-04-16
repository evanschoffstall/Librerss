"use client";

import { useEffect, useRef, useState } from "react";

import {
  DEFAULT_FEED_LIST_SKELETON_COUNT,
  FEED_ARTICLE_SKELETONS,
} from "@/app/dashboard/dashboard-components/feed-config";
import { FeedArticleCardSkeleton } from "@/app/dashboard/dashboard-components/feed-view/FeedArticleCardSkeleton";
import { useFeedListSkeletonCount } from "@/app/dashboard/dashboard-components/feed-view/list-state";
import { DASHBOARD_FEED_WIDTH_CLASS_NAME } from "@/app/dashboard/shared";
import { cn } from "@/lib/utils";

interface FeedListSkeletonProps {
  isInvertedScroll?: boolean;
}

interface FeedLoadMoreSkeletonRowsProps {
  count: number;
}

/**
 * Article-list loading surface that mirrors the collapsed article-card DOM.
 *
 * Each placeholder card copies the collapsed `ArticleCard` header/body anatomy
 * — meta row (date + dot + favicon + source + action buttons), two-line title,
 * and single-line preview — so the first hydrated frame does not shift wrapper
 * spacing, header rails, or preview rhythm when real articles replace them.
 */
export function FeedListSkeleton({
  isInvertedScroll = false,
}: FeedListSkeletonProps) {
  const listRef = useRef<HTMLDivElement | null>(null);
  const [usesMobileBottomUpFallback, setUsesMobileBottomUpFallback] =
    useState(true);
  const [skeletonCount, setSkeletonCount] = useState(
    DEFAULT_FEED_LIST_SKELETON_COUNT,
  );

  useEffect(() => {
    setUsesMobileBottomUpFallback(isInvertedScroll);
  }, [isInvertedScroll]);
  useFeedListSkeletonCount({ listRef, setSkeletonCount });

  return (
    <div
      className={cn(
        "relative flex h-full min-h-0 min-w-0 flex-col gap-1.5",
        DASHBOARD_FEED_WIDTH_CLASS_NAME,
        usesMobileBottomUpFallback ? "max-sm:justify-end" : null,
        isInvertedScroll ? "justify-end" : null,
      )}
      data-dashboard-feed-list-skeleton="true"
      data-dashboard-feed-list-skeleton-count={String(skeletonCount)}
      ref={listRef}
    >
      <FeedLoadMoreSkeletonRows count={skeletonCount} />
    </div>
  );
}

/**
 * Reuses the article-card skeleton anatomy for incremental page loads.
 *
 * The placeholder count is caller-controlled so load-more flows can reserve the
 * exact next page footprint and grow the scrollbar immediately.
 */
export function FeedLoadMoreSkeletonRows({
  count,
}: FeedLoadMoreSkeletonRowsProps) {
  return Array.from({ length: count }, (_value, index) => {
    const descriptor =
      FEED_ARTICLE_SKELETONS[index % FEED_ARTICLE_SKELETONS.length];

    return (
      <div data-dashboard-feed-list-skeleton-item="true" key={index}>
        <FeedArticleCardSkeleton descriptor={descriptor} />
      </div>
    );
  });
}
