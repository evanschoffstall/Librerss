"use client";

import { DebugBorder, DebugGrid } from "@/components";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  ArticleService,
  AuthService,
  ENV,
  normalizeCategoryLabelKey,
  useLocalStorage,
  type Article,
  type AuthUser,
  type CategoryTreeNode,
} from "@/lib";
import { Loader2 } from "lucide-react";
import { Suspense, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { DashboardSidebarContent } from "./components/DashboardSidebarContent";
import { FeedList } from "./components/feed/FeedList";
import { LoginView } from "./components/login/LoginView";
import { SettingsModal } from "./components/settings/SettingsModal";
import {
  ALL_FEEDS_NODE_KEY,
  DEFAULT_FEED_URL,
  INITIAL_CATEGORIES,
} from "./constants";
import { getArticleKey } from "./helpers/article-helpers";
import {
  flattenCategoryFeeds,
  SYSTEM_ALL_FEEDS_CATEGORY,
  toCategoryKey,
} from "./helpers/category-helpers";
import { useArticleActions } from "./hooks/useArticleActions";
import { useCategoryManager } from "./hooks/useCategoryManager";
import { useFeedLoader } from "./hooks/useFeedLoader";

const ARTICLE_FILTER_OPTIONS = ["all", "unread", "read", "starred"] as const;
type ArticleFilter = (typeof ARTICLE_FILTER_OPTIONS)[number];

function filterArticlesByState(
  articles: Article[],
  articleFilter: ArticleFilter,
  expandedArticleKey: string | null,
  collapsingArticleKey: string | null,
): Article[] {
  return articles.filter((article) => {
    if (articleFilter === "all") {
      return true;
    }

    if (articleFilter === "read") {
      return Boolean(article.isRead);
    }

    if (articleFilter === "starred") {
      return Boolean(article.isStarred);
    }

    const articleKey = getArticleKey(article);
    return (
      !article.isRead ||
      expandedArticleKey === articleKey ||
      collapsingArticleKey === articleKey
    );
  });
}

function buildDisplayCategories(
  categories: CategoryTreeNode[],
  customCategoryLabels: string[],
  orderedCategoryLabels: string[],
): CategoryTreeNode[] {
  const categoryMap = new Map<string, CategoryTreeNode>();

  categories.forEach((node) => {
    categoryMap.set(normalizeCategoryLabelKey(node.label), node);
  });

  customCategoryLabels
    .filter(
      (label) =>
        !categories.some(
          (existing) =>
            normalizeCategoryLabelKey(existing.label) ===
            normalizeCategoryLabelKey(label),
        ),
    )
    .forEach((label) => {
      categoryMap.set(normalizeCategoryLabelKey(label), {
        key: toCategoryKey(label),
        label,
        children: [] as CategoryTreeNode[],
      });
    });

  const labelsToDisplay =
    orderedCategoryLabels.length > 0
      ? orderedCategoryLabels
      : [...categoryMap.values()].map((node) => node.label);

  return labelsToDisplay
    .map((label) => categoryMap.get(normalizeCategoryLabelKey(label)))
    .filter((node): node is CategoryTreeNode => Boolean(node));
}

function computeNextOrderedCategoryLabels(
  categories: CategoryTreeNode[],
  customCategoryLabels: string[],
  currentLabels: string[],
): string[] {
  const uniqueLabels = [
    ...categories.map((node) => node.label),
    ...customCategoryLabels.filter(
      (label) =>
        !categories.some(
          (existing) =>
            normalizeCategoryLabelKey(existing.label) ===
            normalizeCategoryLabelKey(label),
        ),
    ),
  ].filter(
    (label, index, allLabels) =>
      allLabels.findIndex(
        (candidate) =>
          normalizeCategoryLabelKey(candidate) ===
          normalizeCategoryLabelKey(label),
      ) === index,
  );

  const preservedLabels = currentLabels.filter((label) =>
    uniqueLabels.some(
      (candidate) =>
        normalizeCategoryLabelKey(candidate) ===
        normalizeCategoryLabelKey(label),
    ),
  );
  const appendedLabels = uniqueLabels.filter(
    (label) =>
      !preservedLabels.some(
        (candidate) =>
          normalizeCategoryLabelKey(candidate) ===
          normalizeCategoryLabelKey(label),
      ),
  );

  return [...preservedLabels, ...appendedLabels];
}

async function initializeDashboardSelection(options: {
  selectedCategory: string;
  loadFeedSources: () => Promise<CategoryTreeNode[]>;
  fetchAllFeeds: (categories?: CategoryTreeNode[]) => Promise<void>;
  fetchFeed: (url: string) => Promise<void>;
  fetchCategoryFeeds: (category: CategoryTreeNode) => Promise<void>;
  setSelectedCategory: (value: string) => void;
  setIsCategoriesLoading: (value: boolean) => void;
}): Promise<void> {
  const {
    selectedCategory,
    loadFeedSources,
    fetchAllFeeds,
    fetchFeed,
    fetchCategoryFeeds,
    setSelectedCategory,
    setIsCategoriesLoading,
  } = options;

  const loadedCategories = await loadFeedSources();
  setIsCategoriesLoading(false);

  if (selectedCategory === ALL_FEEDS_NODE_KEY) {
    await fetchAllFeeds(loadedCategories);
    return;
  }

  const selectedFeedNode = flattenCategoryFeeds(loadedCategories).find(
    (node) => node.key === selectedCategory,
  );
  if (selectedFeedNode?.data?.url) {
    await fetchFeed(selectedFeedNode.data.url);
    return;
  }

  const selectedCategoryNode = loadedCategories.find(
    (node) => node.key === selectedCategory,
  );
  if (selectedCategoryNode) {
    await fetchCategoryFeeds(selectedCategoryNode);
    return;
  }

  setSelectedCategory(ALL_FEEDS_NODE_KEY);
  await fetchAllFeeds(loadedCategories);
}

function refreshCurrentSelection(options: {
  selectedCategory: string;
  selectedFeedUrl?: string;
  selectedCategoryNode?: CategoryTreeNode;
  fetchAllFeeds: () => Promise<void>;
  fetchFeed: (url: string) => Promise<void>;
  fetchCategoryFeeds: (category: CategoryTreeNode) => Promise<void>;
  fallbackFeedUrl?: string;
}): void {
  const {
    selectedCategory,
    selectedFeedUrl,
    selectedCategoryNode,
    fetchAllFeeds,
    fetchFeed,
    fetchCategoryFeeds,
    fallbackFeedUrl = DEFAULT_FEED_URL,
  } = options;

  if (selectedCategory === ALL_FEEDS_NODE_KEY) {
    void fetchAllFeeds();
    return;
  }

  if (selectedFeedUrl) {
    void fetchFeed(selectedFeedUrl);
    return;
  }

  if (selectedCategoryNode) {
    void fetchCategoryFeeds(selectedCategoryNode);
    return;
  }

  void fetchFeed(fallbackFeedUrl);
}

function collectMarkAllReadStreams(
  selectedCategory: string,
  selectedFeedUrl: string | undefined,
  selectedCategoryNode: CategoryTreeNode | undefined,
): string[] {
  if (selectedCategory === ALL_FEEDS_NODE_KEY) {
    return ["user/-/state/com.google/reading-list"];
  }

  if (selectedFeedUrl) {
    return [`feed/${selectedFeedUrl}`];
  }

  if (!selectedCategoryNode?.children?.length) {
    return [];
  }

  return selectedCategoryNode.children
    .map((node) => node.data?.url)
    .filter((url): url is string => Boolean(url))
    .map((url) => `feed/${url}`);
}

const DashboardView = ({ usePlaceholderData }: { usePlaceholderData: boolean }) => {
  const [feed, setFeed] = useState<Article[]>([]);
  const [loading, setLoading] = useState(false);
  const [categories, setCategories] = useState<CategoryTreeNode[]>(INITIAL_CATEGORIES);
  const categoriesRef = useRef<CategoryTreeNode[]>(INITIAL_CATEGORIES);
  categoriesRef.current = categories;
  const [selectedCategory, setSelectedCategory] = useLocalStorage<string>(
    "librerss:selectedCategory",
    ALL_FEEDS_NODE_KEY,
  );
  const [searchTerm, setSearchTerm] = useState("");
  const [expandedArticleKey, setExpandedArticleKey] = useState<string | null>(null);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [isSidebarVisible, setIsSidebarVisible] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [articleFilter, setArticleFilter] = useLocalStorage<ArticleFilter>(
    "librerss:articleFilter",
    "unread",
  );
  const [pageSize, setPageSize] = useLocalStorage<number>("librerss:pageSize", 25);
  const [showFavicons, setShowFavicons] = useLocalStorage<boolean>("librerss:showFavicons", true);
  const [visibleCount, setVisibleCount] = useState<number>(pageSize);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const [isCategoriesLoading, setIsCategoriesLoading] = useState(true);
  const hasInitializedDashboardRef = useRef(false);

  const feedLoader = useFeedLoader({
    usePlaceholderData,
    categoriesRef,
    setFeed,
    setCategories,
    setExpandedArticleKey,
    setLoading,
  });

  const { loadFeedSources, fetchFeed, fetchCategoryFeeds, fetchAllFeeds } = feedLoader;

  const categoryManager = useCategoryManager({
    categories,
    selectedCategory,
    setCategories,
    setSelectedCategory,
    setFeed,
    loadFeedSources,
    fetchFeed,
    fetchCategoryFeeds,
  });

  const articleActions = useArticleActions({
    feed,
    setFeed,
    expandedArticleKey,
    setExpandedArticleKey,
    articleFilter,
  });

  // ── Derived data (computed before effects that depend on them) ────────────

  const customCategoryLabels = categoryManager.customCategoryLabels;
  const orderedCategoryLabels = categoryManager.orderedCategoryLabels;
  const setOrderedCategoryLabels = categoryManager.setOrderedCategoryLabels;

  // Article filter + search
  const feedByState = filterArticlesByState(
    feed,
    articleFilter,
    expandedArticleKey,
    articleActions.collapsingArticleKey,
  );

  const filteredFeed = feedByState.filter(
    (article) =>
      article.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (article.content || "").toLowerCase().includes(searchTerm.toLowerCase()),
  );

  // Sidebar data
  const availableSources = flattenCategoryFeeds(categories);
  const selectedFeedNode = availableSources.find((c) => c.key === selectedCategory);
  const displayCategories = buildDisplayCategories(
    categories,
    customCategoryLabels,
    orderedCategoryLabels,
  );

  const sidebarCategories = [SYSTEM_ALL_FEEDS_CATEGORY, ...displayCategories];
  const selectedCategoryNode = sidebarCategories.find((node) => node.key === selectedCategory);
  const selectedFeedUrl = selectedFeedNode?.data?.url;
  const selectedFeed = selectedFeedNode?.label ?? selectedCategoryNode?.label;
  const categoryOptions = displayCategories.map((node) => node.label);

  // ── Effects ───────────────────────────────────────────────────────────────

  // Feed loading failsafe
  useEffect(() => {
    if (!loading) return;
    const timeoutId = window.setTimeout(() => {
      setLoading(false);
      toast.error("Feed loading timed out.", {
        description: "Please try refreshing the selected source again.",
      });
    }, 20_000);
    return () => window.clearTimeout(timeoutId);
  }, [loading]);

  // Body overflow lock
  useEffect(() => {
    const prevBody = document.body.style.overflow;
    const prevHtml = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevBody;
      document.documentElement.style.overflow = prevHtml;
    };
  }, []);

  // Sidebar fade-in after mount
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setIsSidebarVisible(true));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  // Reset visible count on feed/filter change
  useEffect(() => {
    setVisibleCount(pageSize);
  }, [feed, searchTerm, pageSize, articleFilter]);

  // Infinite scroll
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setVisibleCount((prev) => Math.min(prev + pageSize, filteredFeed.length));
        }
      },
      { threshold: 0 },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [filteredFeed.length, pageSize]);

  // Dashboard initialization
  useEffect(() => {
    if (hasInitializedDashboardRef.current) return;
    hasInitializedDashboardRef.current = true;

    void initializeDashboardSelection({
      selectedCategory,
      loadFeedSources,
      fetchAllFeeds,
      fetchFeed,
      fetchCategoryFeeds,
      setSelectedCategory,
      setIsCategoriesLoading,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync ordered category labels when categories/custom labels change
  useEffect(() => {
    setOrderedCategoryLabels((current) =>
      computeNextOrderedCategoryLabels(
        categories,
        customCategoryLabels,
        current,
      ),
    );
  }, [categories, customCategoryLabels, setOrderedCategoryLabels]);

  // Title sync
  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent("dashboard:title-change", {
        detail: { title: selectedFeed ?? "LibreRSS" },
      }),
    );
  }, [selectedFeed]);

  // Search sync
  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent("dashboard:search-sync", { detail: { term: searchTerm } }),
    );
  }, [searchTerm]);

  // Dashboard event bus
  useEffect(() => {
    const refreshSelection = () => {
      refreshCurrentSelection({
        selectedCategory,
        selectedFeedUrl,
        selectedCategoryNode,
        fetchAllFeeds,
        fetchFeed,
        fetchCategoryFeeds,
      });
    };

    const handleMarkAllRead = async () => {
      const streams = collectMarkAllReadStreams(
        selectedCategory,
        selectedFeedUrl,
        selectedCategoryNode,
      );

      if (streams.length === 0) { toast.info("No readable feed selected."); return; }

      try {
        await Promise.all(Array.from(new Set(streams)).map((stream) => ArticleService.markAllRead(stream)));
        toast.success("Marked all as read.");
        refreshSelection();
      } catch (error) {
        console.error("Mark all read error:", error);
        toast.error("Unable to mark all as read right now.");
      }
    };

    const handleSearchChange = (event: Event) => {
      const customEvent = event as CustomEvent<{ term?: string }>;
      setSearchTerm(customEvent.detail?.term ?? "");
    };

    const handleOpenSettings = () => setShowSettingsModal(true);
    const handleOpenFeedsSidebar = () => setIsMobileSidebarOpen(true);

    window.addEventListener("dashboard:refresh", refreshSelection);
    window.addEventListener("dashboard:mark-all-read", handleMarkAllRead);
    window.addEventListener("dashboard:open-settings", handleOpenSettings);
    window.addEventListener("dashboard:open-feeds-sidebar", handleOpenFeedsSidebar);
    window.addEventListener("dashboard:search-change", handleSearchChange as EventListener);

    return () => {
      window.removeEventListener("dashboard:refresh", refreshSelection);
      window.removeEventListener("dashboard:mark-all-read", handleMarkAllRead);
      window.removeEventListener("dashboard:open-settings", handleOpenSettings);
      window.removeEventListener("dashboard:open-feeds-sidebar", handleOpenFeedsSidebar);
      window.removeEventListener("dashboard:search-change", handleSearchChange as EventListener);
    };
  }, [selectedCategory, selectedCategoryNode, selectedFeedUrl, fetchAllFeeds, fetchFeed, fetchCategoryFeeds]);

  const handleFeedClick = (feedNode: CategoryTreeNode) => {
    setSelectedCategory(feedNode.key);
    setIsMobileSidebarOpen(false);
    if (feedNode.data?.url) fetchFeed(feedNode.data.url);
  };

  const handleCategoryClick = (categoryNode: CategoryTreeNode) => {
    setSelectedCategory(categoryNode.key);
    setIsMobileSidebarOpen(false);
    if (categoryNode.key === ALL_FEEDS_NODE_KEY) { fetchAllFeeds(); return; }
    fetchCategoryFeeds(categoryNode);
  };

  const sidebarProps = {
    isCategoriesLoading,
    isSidebarVisible,
    sidebarCategories,
    selectedCategory,
    showFavicons,
    onCategoryClick: handleCategoryClick,
    onFeedClick: handleFeedClick,
  };

  return (
    <div className="mx-auto flex h-full max-w-6xl flex-col overflow-hidden px-4 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] pt-20 md:px-6">
      <Drawer open={isMobileSidebarOpen} onOpenChange={setIsMobileSidebarOpen}>
        <DrawerContent className="max-h-[85vh] lg:hidden">
          <DrawerHeader>
            <DrawerTitle>Feeds</DrawerTitle>
          </DrawerHeader>
          <div className="min-h-0 flex-1 overflow-hidden px-4 pb-4">
            <ScrollArea className="h-[65vh]">
              <DashboardSidebarContent {...sidebarProps} />
            </ScrollArea>
          </div>
        </DrawerContent>
      </Drawer>

      <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-hidden lg:flex-row lg:items-stretch">
        <aside className="hidden min-h-0 overflow-hidden lg:block lg:w-[220px] lg:shrink-0">
          <ScrollArea
            className={`h-full transition-opacity duration-150 ease-linear ${isSidebarVisible ? "opacity-100" : "opacity-0"
              }`}
          >
            <DashboardSidebarContent {...sidebarProps} />
          </ScrollArea>
        </aside>

        <Separator orientation="vertical" className="hidden lg:block" />

        <section className="flex min-h-0 flex-1 flex-col overflow-hidden lg:min-w-0">
          <div className="mb-2 flex items-center gap-2 pr-3">
            {ARTICLE_FILTER_OPTIONS.map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setArticleFilter(value)}
                className={`rounded-md px-2 py-1 text-xs capitalize transition-colors ${articleFilter === value
                  ? "bg-muted/70 text-foreground"
                  : "text-muted-foreground/70 hover:bg-muted/40 hover:text-foreground"
                  }`}
              >
                {value}
              </button>
            ))}
          </div>

          <ScrollArea className="min-h-0 flex-1">
            <FeedList
              loading={loading}
              filteredFeed={filteredFeed}
              visibleCount={visibleCount}
              expandedArticleKey={expandedArticleKey}
              hydratedArticleLinks={articleActions.hydratedArticleLinks}
              hydratingArticleLinks={articleActions.hydratingArticleLinks}
              updatingArticleState={articleActions.updatingArticleState}
              showFavicons={showFavicons}
              searchTerm={searchTerm}
              selectedCategory={selectedCategory}
              selectedFeedUrl={selectedFeedUrl}
              sentinelRef={sentinelRef}
              onToggle={(article) => void articleActions.handleArticleToggle(article)}
              onToggleRead={(article) => void articleActions.handleToggleReadState(article)}
              onToggleStarred={(article) => void articleActions.handleToggleStarredState(article)}
              onClearSearch={() => setSearchTerm("")}
              onRefresh={() => {
                if (selectedCategory === ALL_FEEDS_NODE_KEY) { fetchAllFeeds(); return; }
                fetchFeed(selectedFeedUrl ?? DEFAULT_FEED_URL);
              }}
            />
          </ScrollArea>
        </section>
      </div>

      {showSettingsModal && (
        <SettingsModal
          onClose={() => setShowSettingsModal(false)}
          categories={displayCategories}
          categoryOptions={categoryOptions}
          pendingCategoryRemovalLabel={categoryManager.pendingCategoryRemovalLabel}
          selectedCategory={selectedCategory}
          pageSize={pageSize}
          showFavicons={showFavicons}
          onPageSizeChange={setPageSize}
          onShowFaviconsChange={setShowFavicons}
          onImportOpml={categoryManager.importOpmlFeeds}
          onSelectFeed={categoryManager.selectFeedByKey}
          onDropFeed={categoryManager.moveFeedByDrop}
          onAddFeed={categoryManager.addFeedSource}
          onAddCategory={categoryManager.addCategory}
          onRenameCategory={categoryManager.renameCategory}
          onDropCategory={categoryManager.moveCategoryByDrop}
          onRemoveCategory={categoryManager.removeCategory}
          onRemoveFeed={categoryManager.removeFeedSource}
          onRenameFeed={categoryManager.renameFeedSource}
        />
      )}
    </div>
  );
};

function DashboardRouter() {
  const [isSessionLoading, setIsSessionLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [allowSignup, setAllowSignup] = useState(true);
  const [usePlaceholderData, setUsePlaceholderData] = useState(false);
  const [isPreviewMode, setIsPreviewMode] = useState(false);

  useEffect(() => {
    const loadSession = async () => {
      try {
        const session = await AuthService.getSession();
        setAllowSignup(session.allowSignup);
        setUsePlaceholderData(session.usePlaceholderData);
        setCurrentUser(session.authenticated ? session.user : null);
      } catch {
        setAllowSignup(true);
        setCurrentUser(null);
      } finally {
        setIsSessionLoading(false);
      }
    };
    loadSession();
  }, []);

  const handleEnterPreview = () => {
    setIsPreviewMode(true);
    window.dispatchEvent(new CustomEvent("dashboard:enter-preview"));
  };

  if (isSessionLoading) {
    return (
      <main className="h-full overflow-hidden bg-background">
        <div className="flex h-full items-center justify-center">
          <Loader2 className="size-4 animate-spin text-muted-foreground/40" />
        </div>
      </main>
    );
  }

  if (!currentUser && !isPreviewMode) {
    return (
      <main className="h-full overflow-hidden bg-background">
        <LoginView
          onAuthenticated={setCurrentUser}
          allowSignup={allowSignup}
          onEnterPreview={!allowSignup ? handleEnterPreview : undefined}
        />
      </main>
    );
  }

  return (
    <main className="h-full overflow-hidden bg-background">
      <DashboardView usePlaceholderData={isPreviewMode || usePlaceholderData} />
    </main>
  );
}

export default function Dashboard() {
  return (
    <>
      {ENV.isDevelopment && (
        <>
          <DebugBorder />
          <DebugGrid />
        </>
      )}
      <div className="h-screen min-h-[100svh] overflow-hidden md:h-[100dvh]">
        <Suspense
          fallback={
            <div className="flex h-full items-center justify-center overflow-hidden">
              <Loader2 className="size-4 animate-spin text-muted-foreground/40" />
            </div>
          }
        >
          <DashboardRouter />
        </Suspense>
      </div>
    </>
  );
}
