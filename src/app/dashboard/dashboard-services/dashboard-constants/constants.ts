import type { CategoryTreeNode } from "@/lib/core";

import {
  MOBILE_TOAST_TOP_STORAGE_KEY,
  MOBILE_TOOLBAR_BOTTOM_STORAGE_KEY,
  MOBILE_TOOLBAR_MIRROR_STORAGE_KEY,
  MOBILE_UI_GROUPED_LAYOUT_STORAGE_KEY,
  SETTINGS_PANEL_TAB_STORAGE_KEY,
} from "@/lib";
import { DEFAULT_CATEGORY_LABEL } from "@/lib/utils";

export const DEFAULT_FEED_URL = "https://feeds.bbci.co.uk/news/world/rss.xml";
export const ALL_FEEDS_LABEL = "All Feeds";
export const ALL_FEEDS_NODE_KEY = "system-all-feeds";
/** Persist only the current feed or category selection across reloads. */
export const DASHBOARD_SELECTED_CATEGORY_STORAGE_KEY =
  "librerss:selectedCategory";
/** Persist only the active quick token filter across reloads. */
export const DASHBOARD_ARTICLE_FILTER_STORAGE_KEY = "librerss:articleFilter";
/** Persist the configured dashboard page size across reloads and reset. */
export const DASHBOARD_ARTICLES_PER_PAGE_STORAGE_KEY =
  "librerss:articlesPerPage";
export const MOBILE_INVERTED_SCROLL_STORAGE_KEY =
  "librerss:mobileInvertedScroll";
export {
  MOBILE_TOAST_TOP_STORAGE_KEY,
  MOBILE_TOOLBAR_BOTTOM_STORAGE_KEY,
  MOBILE_TOOLBAR_MIRROR_STORAGE_KEY,
  MOBILE_UI_GROUPED_LAYOUT_STORAGE_KEY,
  SETTINGS_PANEL_TAB_STORAGE_KEY,
};

export const DASHBOARD_EVENTS = {
  ARTICLE_COLLAPSE_SETTLED: "dashboard:article-collapse-settled",
  ARTICLE_EXPAND_PREPARED: "dashboard:article-expand-prepared",
  ARTICLE_EXPAND_SETTLED: "dashboard:article-expand-settled",
  ARTICLE_READ_TOGGLE_START: "dashboard:article-read-toggle-start",
  ENTER_PREVIEW: "dashboard:enter-preview",
  MARK_ALL_READ: "dashboard:mark-all-read",
  MARK_ALL_READ_END: "dashboard:mark-all-read-end",
  MARK_ALL_READ_START: "dashboard:mark-all-read-start",
  MARK_VIEWPORT_READ: "dashboard:mark-viewport-read",
  MARK_VIEWPORT_READ_END: "dashboard:mark-viewport-read-end",
  MARK_VIEWPORT_READ_START: "dashboard:mark-viewport-read-start",
  OPEN_FEEDS_SIDEBAR: "dashboard:open-feeds-sidebar",
  OPEN_SETTINGS: "dashboard:open-settings",
  REFRESH: "dashboard:refresh",
  REFRESH_END: "dashboard:refresh-end",
  REFRESH_START: "dashboard:refresh-start",
  SEARCH_CHANGE: "dashboard:search-change",
  SEARCH_PENDING: "dashboard:search-pending",
  SEARCH_SYNC: "dashboard:search-sync",
  SHELL_LOADING: "dashboard:shell-loading",
  TITLE_CHANGE: "dashboard:title-change",
} as const;

export const INITIAL_CATEGORIES: CategoryTreeNode[] = [
  {
    children: [],
    key: "0",
    label: DEFAULT_CATEGORY_LABEL,
  },
];

export type BackgroundMode = "none" | "particles" | "stars";
