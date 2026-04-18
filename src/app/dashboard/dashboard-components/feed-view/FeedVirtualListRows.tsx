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

/**
 * Render the feed virtual list article row component.
 * @param props - The component props.
 * @returns The rendered feed virtual list article row component.
 */
export function FeedVirtualListArticleRow(
  props: FeedVirtualListArticleRowProps,
) {
  const {
    article,
    estimatedItemHeight,
    index,
    itemKey,
    measureElement,
    offsetTop,
    renderArticle,
  } = props;
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

/**
 * Render the feed virtual list boundary row component.
 * @param props - The component props.
 * @returns The rendered feed virtual list boundary row component.
 */
export function FeedVirtualListBoundaryRow(
  props: FeedVirtualListBoundaryRowProps,
) {
  const {
    index: _index,
    itemKey,
    loadMoreSentinelRef,
    measureElement,
    offsetTop,
  } = props;
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

/**
 * Build the absolute row style.
 * @param offsetTop - The offset top.
 * @returns The absolute row style.
 */
function buildAbsoluteRowStyle(offsetTop: null | number | undefined) {
  if (typeof offsetTop !== "number") {
    return undefined;
  }

  return { transform: `translateY(${offsetTop}px)` };
}
