"use client";

import { FeedService } from "@/src/services/api";
import type { Article, CategoryTreeNode } from "@/src/types";
import { useEffect, useState } from "react";
import ButtonBar from "./components/FeedView/ButtonBar";
import ItemView from "./components/FeedView/ItemView";
import TreeView from "./components/FeedView/TreeView";

const DEFAULT_FEED_URL = "https://feeds.bbci.co.uk/news/world/rss.xml";

const INITIAL_CATEGORIES: CategoryTreeNode[] = [
  {
    key: "0",
    label: "Categories",
    children: [
      {
        key: "0-0",
        label: "World News",
        data: { url: DEFAULT_FEED_URL },
      },
    ],
  },
];

export default function Home() {
  const [feed, setFeed] = useState<Article[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [categories] = useState<CategoryTreeNode[]>(INITIAL_CATEGORIES);
  const [expandedKeys] = useState<Record<string, boolean>>({});

  const fetchFeed = async () => {
    setLoading(true);
    setError(null);

    try {
      const articles = await FeedService.getFeed(DEFAULT_FEED_URL);
      setFeed(articles);
    } catch (err) {
      setError("Failed to fetch feed. Please try again.");
      console.error("Feed fetch error:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFeed();
  }, []);

  return (
    <div className="container mx-auto px-4">
      <header className="mb-6">
        <h1 className="text-4xl font-bold mb-4">LibreRSS</h1>
        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
            {error}
          </div>
        )}
      </header>

      <ButtonBar onRefresh={fetchFeed} loading={loading} />

      <div className="md:flex gap-6">
        <aside className="md:w-1/4">
          <TreeView categories={categories} expandedKeys={expandedKeys} />
        </aside>

        <main className="md:w-3/4">
          <ItemView feed={feed} loading={loading} />
        </main>
      </div>
    </div>
  );
}
