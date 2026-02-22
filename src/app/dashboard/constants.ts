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

export const SAMPLE_FEEDS = [
  {
    name: "BBC World News",
    url: "https://feeds.bbci.co.uk/news/world/rss.xml",
  },
  { name: "Reuters", url: "https://feeds.reuters.com/reuters/topNews" },
  { name: "TechCrunch", url: "https://techcrunch.com/feed/" },
  { name: "Hacker News", url: "https://feeds.feedburner.com/ycombinator" },
];
