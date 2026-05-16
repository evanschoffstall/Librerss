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

/**
 * Describes the props for the feed list skeleton component.
 */
interface FeedListSkeletonProps {
  isInvertedScroll?: boolean;
}

/** Describes the props for the optional load-more skeleton wrapper. */
interface FeedLoadMoreSkeletonBlockProps extends FeedLoadMoreSkeletonRowsProps {
  visible: boolean;
}

/**
 * Describes the props for the feed load more skeleton rows component.
 */
interface FeedLoadMoreSkeletonRowsProps {
  count: number;
}

/**
 * Render the feed list skeleton component.
 * @param props - The component props.
 * @returns The rendered feed list skeleton component.
 */
export function FeedListSkeleton(props: FeedListSkeletonProps) {
  const { isInvertedScroll = false } = props;
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
 * Render the load-more skeleton wrapper when additional rows are pending.
 * @param props - Visibility flag and skeleton row count.
 * @returns The load-more skeleton block, or null when hidden.
 */
export function FeedLoadMoreSkeletonBlock(
  props: FeedLoadMoreSkeletonBlockProps,
) {
  if (!props.visible || props.count <= 0) {
    return null;
  }

  return (
    <div data-feed-load-more-skeletons="true">
      <FeedLoadMoreSkeletonRows count={props.count} />
    </div>
  );
}

/**
 * Render the feed load more skeleton rows component.
 * @param props - The component props.
 * @returns The rendered feed load more skeleton rows component.
 */
export function FeedLoadMoreSkeletonRows(props: FeedLoadMoreSkeletonRowsProps) {
  const { count } = props;
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
