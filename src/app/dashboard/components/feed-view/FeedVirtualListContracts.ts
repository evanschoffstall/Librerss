import type { FeedScrollMode } from "@/app/dashboard/components/feed-view/feed-list-surface-state/view-core";
import type { Article } from "@/lib/core";

/**
 * Describes the props for the feed virtual list shared component.
 */
export interface FeedVirtualListSharedProps {
  className: string;
  deferTotalListHeightChange?: boolean;
  estimatedItemHeight: number;
  loadMoreSentinelRef: (node: HTMLDivElement | null) => void;
  minimumTotalListHeight?: number;
  onTotalListHeightChange: (nextTotalListHeight: number) => void;
  renderArticle: (article: Article) => React.JSX.Element;
  scrollMode: FeedScrollMode;
  scrollViewport: HTMLElement;
}
