"use client";

import { DebugBorder, DebugGrid, Space } from "@/src/components";
import { ENV, FeedService, type Article, type CategoryTreeNode } from "@/src/lib";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ArticleCard, FeedCategory, LoginView, SettingsModal, SettingsView } from "./components";
import { DASHBOARD_CONFIG, DASHBOARD_TEXTS, DEFAULT_FEED_URL, INITIAL_CATEGORIES, UI_MESSAGES } from "./constants";

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
      setError(UI_MESSAGES.ERROR_FETCH);
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

  return (
    <div className="max-w-7xl mx-auto px-6 py-6">
      {/* Compact Header */}
      <div className="dashboard-header">
        <div>
          <h1 className="text-3xl font-bold text-white mb-1">{DASHBOARD_TEXTS.TITLE}</h1>
          <p className="text-gray-400">{DASHBOARD_TEXTS.SUBTITLE}</p>
        </div>

        <div className="flex items-center space-x-4">
          {/* Search Bar */}
          <div className="dashboard-search-container">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={UI_MESSAGES.SEARCH_PLACEHOLDER}
              className="dashboard-search-input"
            />
            <svg className="dashboard-search-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>

          {/* Refresh Button */}
          <button
            onClick={() => fetchFeed(categories[0]?.children?.find(c => c.key === selectedCategory)?.data?.url)}
            disabled={loading}
            className="dashboard-action-button disabled:opacity-50"
          >
            {loading ? (
              <div className="dashboard-loading-spinner" />
            ) : (
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            )}
          </button>

          {/* Settings Button */}
          <button
            onClick={() => setShowSettingsModal(true)}
            className="dashboard-action-button"
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
        <div className="error-message">
          <div className="error-content">
            <svg className="error-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="error-text">{error}</span>
            <button
              onClick={() => setError(null)}
              className="error-close"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}

      <div className="dashboard-grid">
        {/* Sidebar */}
        <aside className="dashboard-sidebar">
          <div className="glass-card p-6">
            <h2 className="section-header mb-6">{DASHBOARD_TEXTS.FEED_CATEGORIES}</h2>
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
                <div className="dashboard-progress-bar">
                  <div
                    className="dashboard-progress-fill"
                    style={{ width: loading ? '100%' : `${Math.min((filteredFeed.length / DASHBOARD_CONFIG.MAX_ARTICLES_FOR_PROGRESS) * 100, 100)}%` }}
                  />
                </div>
              </div>
            </div>
          </div>
        </aside>

        {/* Main Content */}
        <main className="dashboard-main">
          {loading ? (
            <div className="loading-container">
              <div className="loading-content">
                <div className="loading-spinner-large" />
                <p className="loading-text">{UI_MESSAGES.LOADING}</p>
              </div>
            </div>
          ) : filteredFeed.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-content">
                <div className="empty-state-icon">
                  <svg className="w-10 h-10 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <h3 className="empty-state-title">{UI_MESSAGES.NO_ARTICLES_TITLE}</h3>
                <p className="empty-state-description">
                  {searchTerm ? UI_MESSAGES.NO_ARTICLES_SEARCH : UI_MESSAGES.NO_ARTICLES_DEFAULT}
                </p>
                {searchTerm ? (
                  <button
                    onClick={() => setSearchTerm("")}
                    className="glass-card px-6 py-3 hover:bg-white/10 transition-all duration-300 text-blue-300"
                  >
                    {UI_MESSAGES.CLEAR_SEARCH}
                  </button>
                ) : (
                  <button
                    onClick={() => fetchFeed(categories[0]?.children?.find(c => c.key === selectedCategory)?.data?.url)}
                    className="glass-card px-6 py-3 hover:bg-white/10 transition-all duration-300 text-blue-300"
                  >
                    {UI_MESSAGES.TRY_REFRESHING}
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
        <footer className="dashboard-footer">
          <div className="dashboard-footer-content">
            <a
              href="/landing"
              className="dashboard-footer-link"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              <span>{DASHBOARD_TEXTS.BACK_TO_LANDING}</span>
            </a>
          </div>
        </footer>
      </div>

      {/* Settings Modal */}
      {showSettingsModal && <SettingsModal onClose={() => setShowSettingsModal(false)} />}
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
