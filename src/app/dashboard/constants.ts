import { type CategoryTreeNode } from "@/lib";
import {
  getPlaceholderArticlesForSource,
  PLACEHOLDER_ARTICLES,
  PLACEHOLDER_CATEGORY,
  PLACEHOLDER_FEED_SOURCES,
} from "@/lib/core/placeholder";
import { DEFAULT_CATEGORY_LABEL } from "@/lib/utils/categories";

export { DEFAULT_CATEGORY_LABEL };
export const DEFAULT_FEED_URL = "https://feeds.bbci.co.uk/news/world/rss.xml";
export const SYSTEM_CATEGORY_LABEL = "System";
export const ALL_FEEDS_LABEL = "All Feeds";
export const ALL_FEEDS_NODE_KEY = "system-all-feeds";
export const DEV_PLACEHOLDER_CATEGORY_LABEL = PLACEHOLDER_CATEGORY;

export const DEV_PLACEHOLDER_FEED_SOURCES = PLACEHOLDER_FEED_SOURCES;

export const INITIAL_CATEGORIES: CategoryTreeNode[] = [
  {
    key: "0",
    label: DEFAULT_CATEGORY_LABEL,
    children: [],
  },
];

export const SAMPLE_FEEDS = [
  {
    name: "BBC World News",
    url: "https://feeds.bbci.co.uk/news/world/rss.xml",
  },
  { name: "Reuters", url: "http://feeds.reuters.com/reuters/topNews" },
  { name: "TechCrunch", url: "https://techcrunch.com/feed/" },
  { name: "Hacker News", url: "https://feeds.feedburner.com/ycombinator" },
];

export const DEV_PLACEHOLDER_ARTICLES = PLACEHOLDER_ARTICLES;
export { getPlaceholderArticlesForSource as getDevPlaceholderArticlesForSource };
