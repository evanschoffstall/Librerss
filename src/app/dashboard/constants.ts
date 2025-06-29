// Dashboard page constants

export const DEFAULT_FEED_URL = "https://feeds.bbci.co.uk/news/world/rss.xml";

export const SAMPLE_FEEDS = [
  { name: "BBC World News", url: "https://feeds.bbci.co.uk/news/world/rss.xml" },
  { name: "Reuters", url: "http://feeds.reuters.com/reuters/topNews" },
  { name: "TechCrunch", url: "https://techcrunch.com/feed/" },
  { name: "Hacker News", url: "https://feeds.feedburner.com/ycombinator" },
];

export const INITIAL_CATEGORIES = [
  {
    key: "0",
    label: "My Feeds",
    children: [
      { key: "0-0", label: "World News", data: { url: DEFAULT_FEED_URL } },
      { key: "0-1", label: "Technology", data: { url: "https://techcrunch.com/feed/" } },
      { key: "0-2", label: "Science", data: { url: "https://feeds.feedburner.com/oreilly/radar" } },
    ],
  },
];

// Dashboard configuration
export const DASHBOARD_CONFIG = {
  MAX_ARTICLES_FOR_PROGRESS: 50,
  SEARCH_DEBOUNCE_MS: 300,
  AUTO_REFRESH_INTERVAL_MS: 300000, // 5 minutes
} as const;
