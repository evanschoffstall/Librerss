"use client";

import { DebugBorder, DebugGrid, Space } from "@/src/components";
import { ENV, FeedService, isValidUrl, type Article, type CategoryTreeNode } from "@/src/lib";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const DEFAULT_FEED_URL = "https://feeds.bbci.co.uk/news/world/rss.xml";

const SAMPLE_FEEDS = [
  { name: "BBC World News", url: "https://feeds.bbci.co.uk/news/world/rss.xml" },
  { name: "Reuters", url: "http://feeds.reuters.com/reuters/topNews" },
  { name: "TechCrunch", url: "https://techcrunch.com/feed/" },
  { name: "Hacker News", url: "https://feeds.feedburner.com/ycombinator" },
];

const INITIAL_CATEGORIES: CategoryTreeNode[] = [
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

// Beautiful Article Card Component
const ArticleCard = ({ article }: { article: Article }) => (
  <div className="glass-card p-6 mb-6 hover:bg-white/10 transition-all duration-500 hover:scale-[1.02] hover:shadow-2xl hover:shadow-blue-500/10 group cursor-pointer">
    <div className="flex flex-col h-full">
      <h3 className="text-xl font-semibold text-white mb-3 group-hover:text-blue-200 transition-colors duration-300 line-clamp-2">
        {article.title}
      </h3>

      <p className="text-gray-300 mb-4 line-clamp-3 flex-grow leading-relaxed">
        {article.content || "No description available"}
      </p>

      <div className="flex items-center justify-between pt-4 border-t border-white/10">
        <span className="text-sm text-gray-400">
          {new Date(article.publication_date || Date.now()).toLocaleDateString()}
        </span>
        <a
          href={article.link}
          target="_blank"
          rel="noopener noreferrer"
          className="cta-button-secondary !py-2 !px-4 !text-sm inline-flex items-center space-x-2"
          onClick={(e) => e.stopPropagation()}
        >
          <span>Read More</span>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
        </a>
      </div>
    </div>
  </div>
);

// Modern Feed Category Component
const FeedCategory = ({
  category,
  isActive,
  onClick
}: {
  category: CategoryTreeNode;
  isActive: boolean;
  onClick: () => void;
}) => (
  <div
    onClick={onClick}
    className={`glass-card p-4 mb-3 cursor-pointer transition-all duration-300 group ${isActive
      ? 'bg-blue-500/20 border-blue-400/50 shadow-lg shadow-blue-500/20'
      : 'hover:bg-white/10 hover:border-white/20'
      }`}
  >
    <div className="flex items-center space-x-3">
      <div className={`w-3 h-3 rounded-full transition-all duration-300 ${isActive ? 'bg-blue-400' : 'bg-gray-400 group-hover:bg-white'
        }`} />
      <span className={`font-medium transition-colors duration-300 ${isActive ? 'text-blue-200' : 'text-white group-hover:text-blue-200'
        }`}>
        {category.label}
      </span>
    </div>
  </div>
);

// Login Component
const LoginView = () => (
  <div className="max-w-4xl mx-auto px-6 py-20">
    <div className="text-center mb-16">
      <h1 className="hero-title mb-8">Welcome Back</h1>
      <p className="hero-subtitle mb-12">Sign in to access your personalized RSS feeds</p>

      <div className="glass-card p-12 max-w-md mx-auto">
        <div className="space-y-6">
          <div className="space-y-4">
            <input
              type="email"
              placeholder="Email address"
              className="w-full p-4 bg-white/5 border border-white/20 rounded-lg text-white placeholder-gray-400 focus:border-blue-400 focus:outline-none transition-colors duration-300"
            />
            <input
              type="password"
              placeholder="Password"
              className="w-full p-4 bg-white/5 border border-white/20 rounded-lg text-white placeholder-gray-400 focus:border-blue-400 focus:outline-none transition-colors duration-300"
            />
          </div>

          <button className="w-full cta-button-primary">
            Sign In
          </button>

          <div className="text-center">
            <a href="#" className="text-blue-300 hover:text-blue-200 transition-colors duration-300">
              Forgot your password?
            </a>
          </div>
        </div>
      </div>
    </div>
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

// Main Dashboard Component
const DashboardView = () => {
  const [feed, setFeed] = useState<Article[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [categories] = useState<CategoryTreeNode[]>(INITIAL_CATEGORIES);
  const [selectedCategory, setSelectedCategory] = useState("0-0");
  const [searchTerm, setSearchTerm] = useState("");
  const [showSettingsModal, setShowSettingsModal] = useState(false);

  const fetchFeed = async (url: string = DEFAULT_FEED_URL) => {
    setLoading(true);
    setError(null);

    try {
      const articles = await FeedService.getFeed(url);
      setFeed(articles);
    } catch (err) {
      setError("Failed to fetch feed. Please try again.");
      console.error("Feed fetch error:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleCategoryClick = (category: CategoryTreeNode) => {
    setSelectedCategory(category.key);
    if (category.data?.url) {
      fetchFeed(category.data.url);
    }
  };

  const filteredFeed = feed.filter(article =>
    article.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (article.content || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  useEffect(() => {
    fetchFeed();
  }, []);

  // Settings Modal Component
  const SettingsModal = () => (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={() => setShowSettingsModal(false)}
      />

      {/* Modal Content */}
      <div className="relative bg-black/90 border border-white/20 rounded-2xl p-8 max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto backdrop-blur-md">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-3xl font-bold text-white">Dashboard Settings</h2>
          <button
            onClick={() => setShowSettingsModal(false)}
            className="p-2 hover:bg-white/10 rounded-lg transition-colors duration-200"
          >
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Feed Management */}
          <div className="space-y-6">
            <h3 className="text-xl font-semibold text-white border-b border-white/20 pb-2">Feed Management</h3>

            <div className="space-y-4">
              <button className="w-full glass-card p-4 text-left hover:bg-white/10 transition-all duration-300 flex items-center space-x-3">
                <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
                <div>
                  <div className="text-white font-medium">Add New Feed</div>
                  <div className="text-gray-400 text-sm">Subscribe to RSS feeds</div>
                </div>
              </button>

              <button className="w-full glass-card p-4 text-left hover:bg-white/10 transition-all duration-300 flex items-center space-x-3">
                <svg className="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                </svg>
                <div>
                  <div className="text-white font-medium">Organize Categories</div>
                  <div className="text-gray-400 text-sm">Manage feed categories</div>
                </div>
              </button>

              <button className="w-full glass-card p-4 text-left hover:bg-white/10 transition-all duration-300 flex items-center space-x-3">
                <svg className="w-5 h-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                <div>
                  <div className="text-white font-medium">Remove Feeds</div>
                  <div className="text-gray-400 text-sm">Unsubscribe from feeds</div>
                </div>
              </button>
            </div>
          </div>

          {/* Preferences */}
          <div className="space-y-6">
            <h3 className="text-xl font-semibold text-white border-b border-white/20 pb-2">Preferences</h3>

            <div className="space-y-4">
              <div className="glass-card p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-white font-medium">Auto-refresh</div>
                    <div className="text-gray-400 text-sm">Automatically refresh feeds</div>
                  </div>
                  <div className="w-12 h-6 bg-blue-600 rounded-full relative cursor-pointer">
                    <div className="w-5 h-5 bg-white rounded-full absolute right-0.5 top-0.5 transition-transform duration-200"></div>
                  </div>
                </div>
              </div>

              <div className="glass-card p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-white font-medium">Dark mode</div>
                    <div className="text-gray-400 text-sm">Use dark theme</div>
                  </div>
                  <div className="w-12 h-6 bg-blue-600 rounded-full relative cursor-pointer">
                    <div className="w-5 h-5 bg-white rounded-full absolute right-0.5 top-0.5 transition-transform duration-200"></div>
                  </div>
                </div>
              </div>

              <div className="glass-card p-4">
                <div>
                  <div className="text-white font-medium mb-2">Articles per page</div>
                  <select className="w-full p-2 bg-white/5 border border-white/20 rounded-lg text-white">
                    <option value="10">10 articles</option>
                    <option value="25">25 articles</option>
                    <option value="50">50 articles</option>
                  </select>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Export/Import Section */}
        <div className="mt-8 pt-6 border-t border-white/20">
          <h3 className="text-xl font-semibold text-white mb-4">Data Management</h3>
          <div className="flex space-x-4">
            <button className="glass-card px-6 py-3 hover:bg-white/10 transition-all duration-300 text-white">
              Export OPML
            </button>
            <button className="glass-card px-6 py-3 hover:bg-white/10 transition-all duration-300 text-white">
              Import OPML
            </button>
            <button className="glass-card px-6 py-3 hover:bg-white/10 transition-all duration-300 text-white">
              Backup Settings
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="max-w-7xl mx-auto px-6 py-6">
      {/* Compact Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-white mb-1">Libre</h1>
          <p className="text-gray-400">Really Simple Syndication</p>
        </div>

        <div className="flex items-center space-x-4">
          {/* Search Bar */}
          <div className="relative">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search articles..."
              className="w-80 p-3 pl-10 bg-white/5 border border-white/20 rounded-lg text-white placeholder-gray-400 focus:border-blue-400 focus:outline-none transition-colors duration-300"
            />
            <svg className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>

          {/* Refresh Button */}
          <button
            onClick={() => fetchFeed(categories[0]?.children?.find(c => c.key === selectedCategory)?.data?.url)}
            disabled={loading}
            className="glass-card px-4 py-3 hover:bg-white/10 transition-all duration-300 disabled:opacity-50"
          >
            {loading ? (
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            )}
          </button>

          {/* Settings Button */}
          <button
            onClick={() => setShowSettingsModal(true)}
            className="glass-card px-4 py-3 hover:bg-white/10 transition-all duration-300"
          >
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="mb-6 p-4 bg-red-500/10 border border-red-400/30 rounded-lg">
          <div className="flex items-center space-x-3">
            <svg className="w-5 h-5 text-red-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-red-200">{error}</span>
            <button
              onClick={() => setError(null)}
              className="ml-auto text-red-400 hover:text-red-300 transition-colors duration-300"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        {/* Sidebar */}
        <aside className="lg:col-span-1">
          <div className="glass-card p-6">
            <h2 className="section-header mb-6">Feed Categories</h2>
            <div className="space-y-2">
              {categories[0]?.children?.map((category) => (
                <FeedCategory
                  key={category.key}
                  category={category}
                  isActive={selectedCategory === category.key}
                  onClick={() => handleCategoryClick(category)}
                />
              ))}
            </div>

            <div className="mt-8 pt-6 border-t border-white/10">
              <div className="text-center">
                <p className="text-gray-400 mb-4">
                  {filteredFeed.length} articles
                </p>
                <div className="w-full bg-white/10 rounded-full h-2">
                  <div
                    className="bg-gradient-to-r from-blue-400 to-purple-500 h-2 rounded-full transition-all duration-500"
                    style={{ width: loading ? '100%' : `${Math.min((filteredFeed.length / 50) * 100, 100)}%` }}
                  />
                </div>
              </div>
            </div>
          </div>
        </aside>

        {/* Main Content */}
        <main className="lg:col-span-3">
          {loading ? (
            <div className="glass-card p-12">
              <div className="text-center">
                <div className="w-16 h-16 border-4 border-white/20 border-t-blue-400 rounded-full animate-spin mx-auto mb-4" />
                <p className="text-xl text-gray-300">Loading fresh articles...</p>
              </div>
            </div>
          ) : filteredFeed.length === 0 ? (
            <div className="glass-card p-12">
              <div className="text-center">
                <div className="w-20 h-20 mx-auto mb-6 bg-white/5 rounded-full flex items-center justify-center">
                  <svg className="w-10 h-10 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <h3 className="text-xl font-semibold text-gray-300 mb-2">No articles available</h3>
                <p className="text-gray-400 mb-6">
                  {searchTerm ?
                    "No articles match your search. Try different keywords." :
                    "Try refreshing or selecting a different feed category."
                  }
                </p>
                {searchTerm ? (
                  <button
                    onClick={() => setSearchTerm("")}
                    className="glass-card px-6 py-3 hover:bg-white/10 transition-all duration-300 text-blue-300"
                  >
                    Clear search
                  </button>
                ) : (
                  <button
                    onClick={() => fetchFeed(categories[0]?.children?.find(c => c.key === selectedCategory)?.data?.url)}
                    className="glass-card px-6 py-3 hover:bg-white/10 transition-all duration-300 text-blue-300"
                  >
                    Try refreshing
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {filteredFeed.map((article, index) => (
                <ArticleCard key={`${article.link}-${index}`} article={article} />
              ))}
            </div>
          )}
        </main>

        {/* Footer */}
        <footer className="mt-16 pt-8 border-t border-white/10">
          <div className="flex items-center justify-center">
            <a
              href="/landing"
              className="text-gray-400 hover:text-white transition-colors duration-300 flex items-center space-x-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              <span>Back to Landing</span>
            </a>
          </div>
        </footer>
      </div>

      {/* Settings Modal */}
      {showSettingsModal && <SettingsModal />}
    </div>
  );
};

export default function Dashboard() {
  const searchParams = useSearchParams();
  const view = searchParams?.get('view') || 'dashboard';

  return (
    <>
      {ENV.isDevelopment && (
        <>
          <DebugBorder />
          <DebugGrid />
        </>
      )}
      <Space />
      <div className="glass" style={{ display: "flex", flexDirection: "column" }}>
        <div style={{ flex: 1, overflow: "auto", overscrollBehavior: "contain" }}>
          <main className="min-h-screen">
            {view === 'login' ? (
              <LoginView />
            ) : view === 'settings' ? (
              <SettingsView />
            ) : (
              <DashboardView />
            )}
          </main>
        </div>
      </div>
    </>
  );
}
