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
  useLocalStorage,
  type Article,
  type AuthUser,
  type CategoryTreeNode,
} from "@/lib";

import { motion } from "framer-motion";
import { Loader2 } from "lucide-react";
import { Suspense, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { DashboardSidebarContent } from "./components/DashboardSidebarContent";
import { FeedList } from "./components/FeedList";
import { LoginView } from "./components/LoginView";
import { SettingsModal } from "./components/SettingsModal";
import {
  ALL_FEEDS_NODE_KEY,
  DEFAULT_FEED_URL,
  INITIAL_CATEGORIES,
} from "./constants";
import {
  flattenCategoryFeeds,
  getArticleKey,
  normalizeLabel,
  panelMotion,
  SYSTEM_ALL_FEEDS_CATEGORY,
  toCategoryKey,
} from "./helpers";
import { useArticleActions } from "./hooks/useArticleActions";
import { useCategoryManager } from "./hooks/useCategoryManager";
import { useFeedLoader } from "./hooks/useFeedLoader";

const DashboardView = ({ usePlaceholderData }: { usePlaceholderData: boolean }) => {
  const [feed, setFeed] = useState<Article[]>([]);
  const [loading, setLoading] = useState(false);
  const [categories, setCategories] = useState<CategoryTreeNode[]>(INITIAL_CATEGORIES);
  const categoriesRef = useRef<CategoryTreeNode[]>(INITIAL_CATEGORIES);
  categoriesRef.current = categories;
  const [selectedCategory, setSelectedCategory] = useState(ALL_FEEDS_NODE_KEY);
  const [searchTerm, setSearchTerm] = useState("");
  const [expandedArticleKey, setExpandedArticleKey] = useState<string | null>(null);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [isSidebarVisible, setIsSidebarVisible] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [articleFilter, setArticleFilter] = useState<"all" | "unread" | "starred">("unread");
  const [pageSize, setPageSize] = useLocalStorage<number>("librerss:pageSize", 25);
  const [showFavicons, setShowFavicons] = useLocalStorage<boolean>("librerss:showFavicons", true);
  const [visibleCount, setVisibleCount] = useState(pageSize);
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

  // Article filter + search
  const feedByState = feed.filter((article) => {
    if (articleFilter === "unread") {
      return !article.isRead || expandedArticleKey === getArticleKey(article);
    }
    if (articleFilter === "starred") return Boolean(article.isStarred);
    return true;
  });

  const filteredFeed = feedByState.filter(
    (article) =>
      article.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (article.content || "").toLowerCase().includes(searchTerm.toLowerCase()),
  );

  // Sidebar data
  const availableSources = flattenCategoryFeeds(categories);
  const selectedFeedNode = availableSources.find((c) => c.key === selectedCategory);
  const categoryMap = new Map<string, CategoryTreeNode>();
  categories.forEach((node) => categoryMap.set(normalizeLabel(node.label), node));
  categoryManager.customCategoryLabels
    .filter((label) => !categories.some((existing) => normalizeLabel(existing.label) === normalizeLabel(label)))
    .forEach((label) => {
      categoryMap.set(normalizeLabel(label), {
        key: toCategoryKey(label),
        label,
        children: [] as CategoryTreeNode[],
      });
    });

  const orderedLabels =
    categoryManager.orderedCategoryLabels.length > 0
      ? categoryManager.orderedCategoryLabels
      : [...categoryMap.values()].map((node) => node.label);

  const displayCategories = orderedLabels
    .map((label) => categoryMap.get(normalizeLabel(label)))
    .filter((node): node is CategoryTreeNode => Boolean(node));

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

    const init = async () => {
      const loadedCategories = await loadFeedSources();
      setIsCategoriesLoading(false);
      setSelectedCategory(ALL_FEEDS_NODE_KEY);
      await fetchAllFeeds(loadedCategories);
    };

    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync ordered category labels when categories/custom labels change
  useEffect(() => {
    const uniqueLabels = [
      ...categories.map((node) => node.label),
      ...categoryManager.customCategoryLabels.filter(
        (label) =>
          !categories.some((existing) => normalizeLabel(existing.label) === normalizeLabel(label)),
      ),
    ].filter(
      (label, index, allLabels) =>
        allLabels.findIndex((candidate) => normalizeLabel(candidate) === normalizeLabel(label)) ===
        index,
    );

    categoryManager.setOrderedCategoryLabels((current) => {
      const preserved = current.filter((label) =>
        uniqueLabels.some((candidate) => normalizeLabel(candidate) === normalizeLabel(label)),
      );
      const additions = uniqueLabels.filter(
        (label) =>
          !preserved.some((candidate) => normalizeLabel(candidate) === normalizeLabel(label)),
      );
      return [...preserved, ...additions];
    });
  }, [categories, categoryManager.customCategoryLabels]);

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
      if (selectedCategory === ALL_FEEDS_NODE_KEY) { fetchAllFeeds(); return; }
      if (selectedFeedUrl) { fetchFeed(selectedFeedUrl); return; }
      if (selectedCategoryNode) { fetchCategoryFeeds(selectedCategoryNode); return; }
      fetchFeed(DEFAULT_FEED_URL);
    };

    const handleMarkAllRead = async () => {
      const streams: string[] = [];
      if (selectedCategory === ALL_FEEDS_NODE_KEY) {
        streams.push("user/-/state/com.google/reading-list");
      } else if (selectedFeedUrl) {
        streams.push(`feed/${selectedFeedUrl}`);
      } else if (selectedCategoryNode?.children?.length) {
        for (const node of selectedCategoryNode.children) {
          const url = node.data?.url;
          if (url) streams.push(`feed/${url}`);
        }
      }

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

    window.addEventListener("dashboard:refresh", refreshSelection);
    window.addEventListener("dashboard:mark-all-read", handleMarkAllRead);
    window.addEventListener("dashboard:open-settings", () => setShowSettingsModal(true));
    window.addEventListener("dashboard:open-feeds-sidebar", () => setIsMobileSidebarOpen(true));
    window.addEventListener("dashboard:search-change", handleSearchChange as EventListener);

    return () => {
      window.removeEventListener("dashboard:refresh", refreshSelection);
      window.removeEventListener("dashboard:mark-all-read", handleMarkAllRead);
      window.removeEventListener("dashboard:open-settings", () => setShowSettingsModal(true));
      window.removeEventListener("dashboard:open-feeds-sidebar", () => setIsMobileSidebarOpen(true));
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
    <motion.div
      className="mx-auto flex h-full max-w-6xl flex-col overflow-hidden px-4 pb-6 pt-20 md:px-6"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: "easeOut" }}
    >
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
            className={`h-full transition-opacity duration-300 ease-out ${
              isSidebarVisible ? "opacity-100" : "opacity-0"
            }`}
          >
            <DashboardSidebarContent {...sidebarProps} />
          </ScrollArea>
        </aside>

        <Separator orientation="vertical" className="hidden lg:block" />

        <motion.section
          className="flex min-h-0 flex-1 flex-col overflow-hidden lg:min-w-0"
          initial={panelMotion.initial}
          animate={panelMotion.animate}
          transition={{ duration: 0.45, ease: "easeOut", delay: 0.1 }}
        >
          <div className="mb-2 flex items-center gap-2 pr-3">
            {(["all", "unread", "starred"] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setArticleFilter(value)}
                className={`rounded-md px-2 py-1 text-xs capitalize transition-colors ${
                  articleFilter === value
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
        </motion.section>
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
    </motion.div>
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
      <div className="h-[100dvh] overflow-hidden">
        <Suspense
          fallback={
            <motion.div
              className="flex h-full items-center justify-center overflow-hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
            >
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 1.1, repeat: Infinity, ease: "linear" }}
              >
                <Loader2 className="size-4 text-muted-foreground/40" />
              </motion.div>
            </motion.div>
          }
        >
          <DashboardRouter />
        </Suspense>
      </div>
    </>
  );
}
