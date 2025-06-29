import { isValidUrl, type CategoryTreeNode } from "@/src/lib";
import { useRef, useState } from "react";
import { INITIAL_CATEGORIES, SAMPLE_FEEDS } from "../constants";

export const SettingsView = () => {
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
    <div className="max-w-6xl mx-auto px-6 py-12">
      <div className="text-center mb-16">
        <h1 className="page-header">Feed Settings</h1>
        <p className="text-xl text-gray-300">Manage your RSS feeds and categories</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
        {/* Add New Feed */}
        <div className="glass-card p-8">
          <h2 className="section-header mb-6">Add New Feed</h2>

          <div className="space-y-6">
            <div>
              <label className="block text-gray-300 mb-2">Category Name</label>
              <input
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                placeholder="Enter category name..."
                className="w-full p-4 bg-white/5 border border-white/20 rounded-lg text-white placeholder-gray-400 focus:border-blue-400 focus:outline-none transition-colors duration-300"
              />
            </div>

            <div>
              <label className="block text-gray-300 mb-2">RSS Feed URL</label>
              <input
                value={newFeedUrl}
                onChange={(e) => setNewFeedUrl(e.target.value)}
                placeholder="https://example.com/feed.xml"
                className="w-full p-4 bg-white/5 border border-white/20 rounded-lg text-white placeholder-gray-400 focus:border-blue-400 focus:outline-none transition-colors duration-300"
              />
            </div>

            <button
              onClick={addCategory}
              disabled={!newCategory.trim()}
              className="w-full cta-button-primary disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Add Feed Category
            </button>
          </div>

          {/* Sample Feeds */}
          <div className="mt-8 pt-8 border-t border-white/10">
            <h3 className="text-lg font-semibold text-white mb-4">Popular Feeds</h3>
            <div className="space-y-2">
              {SAMPLE_FEEDS.map((feed, index) => (
                <div key={index} className="flex items-center justify-between p-3 bg-white/5 rounded-lg">
                  <span className="text-gray-300">{feed.name}</span>
                  <button
                    onClick={() => {
                      setNewCategory(feed.name);
                      setNewFeedUrl(feed.url);
                    }}
                    className="text-blue-300 hover:text-blue-200 transition-colors duration-300"
                  >
                    Use
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Current Categories */}
        <div className="glass-card p-8">
          <h2 className="section-header mb-6">Current Categories</h2>

          <div className="space-y-4">
            {categories[0]?.children?.map((category) => (
              <div key={category.key} className="p-4 bg-white/5 rounded-lg border border-white/10">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-semibold text-white">{category.label}</h4>
                    {category.data?.url && (
                      <p className="text-sm text-gray-400 mt-1 truncate">{category.data.url}</p>
                    )}
                  </div>
                  <button className="text-red-400 hover:text-red-300 transition-colors duration-300">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
