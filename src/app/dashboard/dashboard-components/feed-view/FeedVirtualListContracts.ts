import type { FeedScrollMode } from "@/app/dashboard/dashboard-components/feed-view/feed-list-surface-state/view-core";
import type { Article } from "@/lib/core";

/**
 * Describes the props for the feed virtual list shared component.
 */
export interface FeedVirtualListSharedProps {
  className: string;
  estimatedItemHeight: number;
  loadMoreSentinelRef: (node: HTMLDivElement | null) => void;
  minimumTotalListHeight?: number;
  onTotalListHeightChange: (nextTotalListHeight: number) => void;
  renderArticle: (article: Article) => React.JSX.Element;
  scrollMode: FeedScrollMode;
  scrollViewport: HTMLElement;
}
