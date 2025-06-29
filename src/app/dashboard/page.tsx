"use client";

import { ButtonBar, ItemView, TreeView } from "@/src/components";
import { FeedService, isValidUrl, type Article, type CategoryTreeNode } from "@/src/lib";
import { useSearchParams } from "next/navigation";
import { Button } from "primereact/button";
import { InputText } from "primereact/inputtext";
import { useEffect, useRef, useState } from "react";

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

// Login Component
const LoginView = () => (
  <div className="container mx-auto px-4 py-8">
    <h1 className="text-4xl font-bold mb-6">Login</h1>
    <p>Login functionality coming soon...</p>
  </div>
);

// Settings Component
const SettingsView = () => {
  const keyCounter = useRef(0);
  const [categories, setCategories] = useState<CategoryTreeNode[]>(INITIAL_CATEGORIES);
  const [newCategory, setNewCategory] = useState("");
  const [newFeedUrl, setNewFeedUrl] = useState("");

  const addCategory = () => {
    if (!newCategory.trim()) return;

    const newKey = `0-${++keyCounter.current}`;
    const newNode: CategoryTreeNode = {
      key: newKey,
      label: newCategory,
      data: newFeedUrl && isValidUrl(newFeedUrl) ? { url: newFeedUrl } : undefined,
    };

    setCategories([
      {
        ...categories[0],
        children: [...(categories[0].children || []), newNode],
      },
    ]);

    setNewCategory("");
    setNewFeedUrl("");
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-4xl font-bold mb-6">Settings</h1>

      <div className="mb-8 p-6 bg-gray-100 rounded-lg">
        <h2 className="text-2xl font-semibold mb-4">Add New Feed Category</h2>

        <div className="flex flex-col gap-4 mb-4">
          <InputText
            value={newCategory}
            onChange={(e) => setNewCategory(e.target.value)}
            placeholder="Category name..."
            className="p-2"
          />
          <InputText
            value={newFeedUrl}
            onChange={(e) => setNewFeedUrl(e.target.value)}
            placeholder="RSS feed URL (optional)..."
            className="p-2"
          />
        </div>

        <Button
          label="Add Category"
          onClick={addCategory}
          disabled={!newCategory.trim()}
          className="p-2"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          <h3 className="text-xl font-semibold mb-4">Current Categories</h3>
          <TreeView categories={categories} expandedKeys={{}} />
        </div>
      </div>
    </div>
  );
};

// Main Dashboard Component
const DashboardView = () => {
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
};

export default function Dashboard() {
  const searchParams = useSearchParams();
  const view = searchParams?.get('view') || 'dashboard';

  switch (view) {
    case 'login':
      return <LoginView />;
    case 'settings':
      return <SettingsView />;
    default:
      return <DashboardView />;
  }
}
