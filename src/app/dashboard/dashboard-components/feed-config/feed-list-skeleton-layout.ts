/** Shared skeleton descriptors that mirror the collapsed article-card rhythm. */
export interface FeedArticleSkeletonDescriptor {
  bodyWidth: string;
  metaSourceWidth: string;
  titleWidths: [string, string];
}

export const FEED_ARTICLE_SKELETONS: FeedArticleSkeletonDescriptor[] = [
  {
    bodyWidth: "w-full",
    metaSourceWidth: "w-16",
    titleWidths: ["w-[88%]", "w-[56%]"],
  },
  {
    bodyWidth: "w-[94%]",
    metaSourceWidth: "w-20",
    titleWidths: ["w-[92%]", "w-[68%]"],
  },
  {
    bodyWidth: "w-[90%]",
    metaSourceWidth: "w-14",
    titleWidths: ["w-[84%]", "w-[61%]"],
  },
  {
    bodyWidth: "w-[96%]",
    metaSourceWidth: "w-16",
    titleWidths: ["w-[90%]", "w-[58%]"],
  },
];

export const DEFAULT_FEED_LIST_SKELETON_COUNT =
  FEED_ARTICLE_SKELETONS.length + 1;
export const FEED_LIST_SKELETON_OVERFLOW_ROW_COUNT = 1;
export const MIN_FEED_LIST_SKELETON_COUNT = 1;
interface FeedListSkeletonCountOptions {
  rowGap: number;
  skeletonRowHeight: number;
  viewportHeight: number;
}

/**
 * Resolve the feed list skeleton count.
 * @param options - The options used to resolve the feed list skeleton count.
 * @returns The feed list skeleton count.
 */
export function resolveFeedListSkeletonCount(
  options: FeedListSkeletonCountOptions,
) {
  const { rowGap, skeletonRowHeight, viewportHeight } = options;
  const visibleRowCount = Math.floor(
    (viewportHeight + rowGap) / (skeletonRowHeight + rowGap),
  );

  return Math.max(
    MIN_FEED_LIST_SKELETON_COUNT,
    visibleRowCount + FEED_LIST_SKELETON_OVERFLOW_ROW_COUNT,
  );
}
