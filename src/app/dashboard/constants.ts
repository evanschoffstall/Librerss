import { DEFAULT_CATEGORY_LABEL, type CategoryTreeNode } from "@/lib";

export const DEFAULT_FEED_URL = "https://feeds.bbci.co.uk/news/world/rss.xml";
export const ALL_FEEDS_LABEL = "All Feeds";
export const ALL_FEEDS_NODE_KEY = "system-all-feeds";

export const INITIAL_CATEGORIES: CategoryTreeNode[] = [
  {
    key: "0",
    label: DEFAULT_CATEGORY_LABEL,
    children: [],
  },
];
