import type { Article } from "@/lib/core";

interface FeedVirtualListArticleRowProps {
  article: Article;
  estimatedItemHeight?: number;
  index: number;
  itemKey: string;
  measureElement?: (element: Element | null) => void;
  offsetTop?: number;
  renderArticle: (article: Article) => React.JSX.Element;
}

interface FeedVirtualListBoundaryRowProps {
  index: number;
  itemKey: string;
  loadMoreSentinelRef: (node: HTMLDivElement | null) => void;
  measureElement?: (element: Element | null) => void;
  offsetTop?: number;
}

/** Shared article row used by both runtime and non-virtualized test surfaces. */
export function FeedVirtualListArticleRow({
  article,
  estimatedItemHeight,
  index,
  itemKey,
  measureElement,
  offsetTop,
  renderArticle,
}: FeedVirtualListArticleRowProps) {
  const rowStyle =
    typeof offsetTop === "number"
      ? {
          minHeight: 1,
          transform: `translateY(${offsetTop}px)`,
        }
      : { minHeight: `${estimatedItemHeight ?? 0}px` };

  return (
    <div
      className={
        typeof offsetTop === "number"
          ? "absolute top-0 left-0 w-full"
          : `w-full`
      }
      data-index={index}
      key={itemKey}
      ref={measureElement}
      style={rowStyle}
    >
      {renderArticle(article)}
    </div>
  );
}

/** Shared virtualized boundary row used by both runtime and test surfaces. */
export function FeedVirtualListBoundaryRow({
  index: _index,
  itemKey,
  loadMoreSentinelRef,
  measureElement,
  offsetTop,
}: FeedVirtualListBoundaryRowProps) {
  const rowStyle = buildAbsoluteRowStyle(offsetTop);

  return (
    <div
      className="absolute top-0 left-0 w-full"
      key={itemKey}
      style={rowStyle}
    >
      <div
        className="h-px w-full"
        data-feed-load-more-sentinel="true"
        data-index="boundary"
        ref={measureElement}
      >
        <div className="h-px w-full" ref={loadMoreSentinelRef} />
      </div>
    </div>
  );
}

function buildAbsoluteRowStyle(offsetTop: null | number | undefined) {
  if (typeof offsetTop !== "number") {
    return undefined;
  }

  return { transform: `translateY(${offsetTop}px)` };
}
