import { type CategoryTreeNode, DEFAULT_CATEGORY_LABEL } from "@/lib";

export { DASHBOARD_PREVIEW_STORAGE_KEY } from "./preview-mode";

export const DEFAULT_FEED_URL = "https://feeds.bbci.co.uk/news/world/rss.xml";
export const ALL_FEEDS_LABEL = "All Feeds";
export const ALL_FEEDS_NODE_KEY = "system-all-feeds";
export const MOBILE_TOOLBAR_BOTTOM_STORAGE_KEY = "librerss:mobileToolbarBottom";
export const MOBILE_TOOLBAR_MIRROR_STORAGE_KEY = "librerss:mobileToolbarMirror";
export const SETTINGS_PANEL_TAB_STORAGE_KEY = "librerss:settings-panel-tab";

/** Canonical event names for the dashboard window event bus. */
export const DASHBOARD_EVENTS = {
  ARTICLE_EXPAND_SETTLED: "dashboard:article-expand-settled",
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
