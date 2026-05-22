"use client";

import { useEffect, useRef, useState } from "react";

import {
  DEFAULT_FEED_LIST_SKELETON_COUNT,
  FEED_ARTICLE_SKELETONS,
  FEED_ROW_GAP_PX,
} from "@/app/dashboard/dashboard-components/feed-config";
import { FeedArticleCardSkeleton } from "@/app/dashboard/dashboard-components/feed-view/FeedArticleCardSkeleton";
import { useFeedListSkeletonCount } from "@/app/dashboard/dashboard-components/feed-view/list-state";
import { DASHBOARD_FEED_WIDTH_CLASS_NAME } from "@/app/dashboard/shared";
import { cn } from "@/lib/utils";

const FEED_LOAD_MORE_BOUNDARY_OFFSET_PX = -1;
const FEED_SKELETON_ROW_GAP_PX = FEED_ROW_GAP_PX - 1 / 3;

/**
 * Describes the props for the feed list skeleton component.
 */
interface FeedListSkeletonProps {
  isInvertedScroll?: boolean;
}

/** Describes the props for the optional load-more skeleton wrapper. */
interface FeedLoadMoreSkeletonBlockProps extends FeedLoadMoreSkeletonRowsProps {
  placement: "after-articles" | "before-articles";
  visible: boolean;
}

/**
 * Describes the props for the feed load more skeleton rows component.
 */
interface FeedLoadMoreSkeletonRowsProps {
  count: number;
  trailingGapAfterLast?: boolean;
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
        "relative flex h-full min-h-0 min-w-0 flex-col",
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
    <div
      className="flex flex-col"
      data-feed-load-more-skeletons="true"
      data-feed-load-more-skeletons-placement={props.placement}
      style={{
        marginTop:
          props.placement === "after-articles"
            ? FEED_LOAD_MORE_BOUNDARY_OFFSET_PX
            : undefined,
      }}
    >
      <FeedLoadMoreSkeletonRows
        count={props.count}
        trailingGapAfterLast={props.placement === "before-articles"}
      />
    </div>
  );
}

/**
 * Render the feed load more skeleton rows component.
 * @param props - The component props.
 * @returns The rendered feed load more skeleton rows component.
 */
export function FeedLoadMoreSkeletonRows(props: FeedLoadMoreSkeletonRowsProps) {
  const { count, trailingGapAfterLast = false } = props;
  return Array.from({ length: count }, (_value, index) => {
    const descriptor =
      FEED_ARTICLE_SKELETONS[index % FEED_ARTICLE_SKELETONS.length];
    const hasTrailingGap = index < count - 1 || trailingGapAfterLast;

    return (
      <div
        data-dashboard-feed-list-skeleton-item="true"
        key={index}
        style={{
          marginBottom: hasTrailingGap ? FEED_SKELETON_ROW_GAP_PX : undefined,
        }}
      >
        <FeedArticleCardSkeleton descriptor={descriptor} />
      </div>
    );
  });
}
