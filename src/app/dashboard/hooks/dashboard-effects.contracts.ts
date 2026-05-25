import { type Dispatch, type RefObject, type SetStateAction } from "react";

import type {
  ArticleFilter,
  ArticleSortOrder,
  CategoryTreeNode,
} from "@/lib/core";

import { type FeedSelectionFetchers } from "@/app/dashboard/services/selection";

/** Broadcast payload sources emitted to shell-level dashboard listeners. */
export interface UseDashboardBroadcastsOptions {
  isSearchPending: boolean;
  isShellLoading: boolean;
  searchTerm: string;
  selectedFeed?: string;
}

/** Aggregate inputs required by the composed dashboard effects hook. */
export type UseDashboardEffectsOptions = UseDashboardBroadcastsOptions &
  UseDashboardInitializationOptions &
  UseFeedLoadingTimeoutOptions & {
    setIsSidebarVisible: Dispatch<SetStateAction<boolean>>;
  };

/** Boot-time dashboard selection inputs. */
export type UseDashboardInitializationOptions = FeedSelectionFetchers & {
  articleFilter: ArticleFilter;
  articleSortOrder: ArticleSortOrder;
  hasHydratedPersistedPreferences: boolean;
  hasInitializedDashboardRef: RefObject<boolean>;
  initialArticleLimit?: number;
  loadFeedSources: () => Promise<CategoryTreeNode[]>;
  selectedCategory: string;
  setIsCategoriesLoading: Dispatch<SetStateAction<boolean>>;
  setSelectedCategory: Dispatch<SetStateAction<string>>;
};

/** Feed loading timeout guard inputs. */
export interface UseFeedLoadingTimeoutOptions {
  loading: boolean;
  loadingEpoch: number;
  onTimeout?: () => void;
  setLoading: Dispatch<SetStateAction<boolean>>;
  timeoutMs: number;
}
