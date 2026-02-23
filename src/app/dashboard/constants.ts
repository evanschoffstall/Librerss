import { DEFAULT_CATEGORY_LABEL, type CategoryTreeNode } from "@/lib";

export const DEFAULT_FEED_URL = "https://feeds.bbci.co.uk/news/world/rss.xml";
export const ALL_FEEDS_LABEL = "All Feeds";
export const ALL_FEEDS_NODE_KEY = "system-all-feeds";

/** Canonical event names for the dashboard window event bus. */
export const DASHBOARD_EVENTS = {
  REFRESH: "dashboard:refresh",
  MARK_ALL_READ: "dashboard:mark-all-read",
  OPEN_SETTINGS: "dashboard:open-settings",
  OPEN_FEEDS_SIDEBAR: "dashboard:open-feeds-sidebar",
  SEARCH_CHANGE: "dashboard:search-change",
  TITLE_CHANGE: "dashboard:title-change",
  SEARCH_SYNC: "dashboard:search-sync",
  ENTER_PREVIEW: "dashboard:enter-preview",
} as const;

export const INITIAL_CATEGORIES: CategoryTreeNode[] = [
  {
    key: "0",
    label: DEFAULT_CATEGORY_LABEL,
    children: [],
  },
];
