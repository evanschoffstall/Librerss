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

/**
 * Returns the minimum skeleton count that fills the viewport plus one hidden row.
 *
 * The extra row keeps the loading surface from ending exactly on the fold while
 * still limiting the off-screen reserve to a single article footprint.
 */
export function resolveFeedListSkeletonCount({
  rowGap,
  skeletonRowHeight,
  viewportHeight,
}: {
  rowGap: number;
  skeletonRowHeight: number;
  viewportHeight: number;
}) {
  const visibleRowCount = Math.floor(
    (viewportHeight + rowGap) / (skeletonRowHeight + rowGap),
  );

  return Math.max(
    MIN_FEED_LIST_SKELETON_COUNT,
    visibleRowCount + FEED_LIST_SKELETON_OVERFLOW_ROW_COUNT,
  );
}
