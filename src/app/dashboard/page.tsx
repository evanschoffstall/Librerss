"use client";

import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { DebugBorder, DebugGrid } from "@/src/components";
import {
  AuthService,
  ENV,
  FeedService,
  isValidUrl,
  type OpmlFeedImportEntry,
  type Article,
  type AuthUser,
  type CategoryTreeNode,
} from "@/src/lib";
import { motion } from "framer-motion";
import { Loader2 } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { toast } from "sonner";
import { ArticleCard, FeedCategory, LoginView, SettingsModal, SettingsView } from "./components";
import {
  DEFAULT_CATEGORY_LABEL,
  DEFAULT_FEED_URL,
  DEV_PLACEHOLDER_CATEGORY_LABEL,
  DEV_PLACEHOLDER_FEED_SOURCES,
  INITIAL_CATEGORIES,
  getDevPlaceholderArticlesForSource,
} from "./constants";

const toCategoryKey = (label: string) =>
  `cat-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "default"}`;

const normalizeLabel = (label: string) => label.trim().toLowerCase();

const panelMotion = {
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0 },
};

const flattenCategoryFeeds = (nodes: CategoryTreeNode[]) =>
  nodes.flatMap((category) => category.children ?? []);

const buildCategoriesFromSources = (
  sources: Array<{ id: number; name: string; url: string; category?: string | null }>,
): CategoryTreeNode[] => {
  const grouped = new Map<string, CategoryTreeNode[]>();

  for (const source of sources) {
    const categoryLabel = source.category?.trim() || DEFAULT_CATEGORY_LABEL;
    const current = grouped.get(categoryLabel) ?? [];

    current.push({
      key: `${toCategoryKey(categoryLabel)}-${source.id}`,
      label: source.name,
      data: { url: source.url, sourceId: source.id, category: categoryLabel },
    });

    grouped.set(categoryLabel, current);
  }

  return [...grouped.entries()].map(([label, children]) => ({
    key: toCategoryKey(label),
    label,
    children,
  }));
};

const buildDefaultCategories = (isDevelopment: boolean): CategoryTreeNode[] => {
  if (!isDevelopment) {
    return INITIAL_CATEGORIES;
  }

  return [
    {
      key: toCategoryKey(DEV_PLACEHOLDER_CATEGORY_LABEL),
      label: DEV_PLACEHOLDER_CATEGORY_LABEL,
      children: DEV_PLACEHOLDER_FEED_SOURCES.map((source, index) => ({
        key: `${toCategoryKey(DEV_PLACEHOLDER_CATEGORY_LABEL)}-dev-${index}`,
        label: source.name,
        data: { url: source.url, category: source.category },
      })),
    },
  ];
};

const DashboardView = () => {
  const [feed, setFeed] = useState<Article[]>([]);
  const [isUsingDevPlaceholder, setIsUsingDevPlaceholder] = useState(false);
  const [loading, setLoading] = useState(false);
  const [categories, setCategories] = useState<CategoryTreeNode[]>(INITIAL_CATEGORIES);
  const [selectedCategory, setSelectedCategory] = useState(
    INITIAL_CATEGORIES[0]?.children?.[0]?.key ?? "",
  );
  const [searchTerm, setSearchTerm] = useState("");
  const [expandedArticleKey, setExpandedArticleKey] = useState<string | null>(null);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [isSidebarVisible, setIsSidebarVisible] = useState(false);
  const [customCategoryLabels, setCustomCategoryLabels] = useState<string[]>([]);
  const [orderedCategoryLabels, setOrderedCategoryLabels] = useState<string[]>([]);

  const loadFeedSources = async (): Promise<CategoryTreeNode[]> => {
    try {
      const sources = await FeedService.getFeedSources();

      if (sources.length === 0) {
        const defaults = buildDefaultCategories(ENV.isDevelopment);
        setCategories(defaults);
        return defaults;
      }

      const nextCategories = buildCategoriesFromSources(sources);

      setCategories(nextCategories);
      return nextCategories;
    } catch (err) {
      console.error("Feed source fetch error:", err);
      return buildDefaultCategories(ENV.isDevelopment);
    }
  };

  const selectFeedByKey = (feedKey: string) => {
    const sourceNode = flattenCategoryFeeds(categories).find((item) => item.key === feedKey);
    if (!sourceNode?.data?.url) {
      return;
    }

    setSelectedCategory(sourceNode.key);
    fetchFeed(sourceNode.data.url);
  };

  const addFeedSource = async (name: string, url: string, category: string) => {
    if (!name.trim() || !url.trim()) {
      toast.error("Feed name and URL are required.");
      return false;
    }

    if (!isValidUrl(url)) {
      toast.error("Please enter a valid feed URL.");
      return false;
    }

    try {
      await FeedService.createFeedSource({
        name: name.trim(),
        url: url.trim(),
        category: category.trim() || DEFAULT_CATEGORY_LABEL,
      });
      const nextCategories = await loadFeedSources();
      const latestNode = flattenCategoryFeeds(nextCategories).find(
        (node) => node.data?.url === url.trim(),
      );

      if (latestNode?.data?.url) {
        setSelectedCategory(latestNode.key);
        await fetchFeed(latestNode.data.url);
      }

      toast.success("Feed source added.");
      return true;
    } catch (err) {
      console.error("Add feed source error:", err);
      toast.error("Unable to add feed source.");
      return false;
    }
  };

  const removeFeedSource = async (key: string) => {
    const selectedNode = flattenCategoryFeeds(categories).find((node) => node.key === key);
    const sourceId = selectedNode?.data?.sourceId;

    if (typeof sourceId !== "number" || !Number.isInteger(sourceId) || sourceId <= 0) {
      return;
    }

    try {
      await FeedService.deleteFeedSource(sourceId);
      const nextCategories = await loadFeedSources();
      const nextAvailable = flattenCategoryFeeds(nextCategories);

      if (nextAvailable.length === 0) {
        setSelectedCategory("");
        setFeed([]);
      } else if (selectedCategory === key) {
        const fallback = nextAvailable[0];
        setSelectedCategory(fallback.key);
        if (fallback.data?.url) {
          await fetchFeed(fallback.data.url);
        }
      }

      toast.success("Feed source removed.");
    } catch (err) {
      console.error("Remove feed source error:", err);
      toast.error("Unable to remove feed source.");
    }
  };

  const moveFeedSource = (key: string, direction: "up" | "down") => {
    setCategories((currentCategories) => {
      return currentCategories.map((categoryNode) => {
        const sources = categoryNode.children ?? [];
        const currentIndex = sources.findIndex((source) => source.key === key);

        if (currentIndex < 0) {
          return categoryNode;
        }

        const nextIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
        if (nextIndex < 0 || nextIndex >= sources.length) {
          return categoryNode;
        }

        const nextSources = [...sources];
        const [movedSource] = nextSources.splice(currentIndex, 1);
        nextSources.splice(nextIndex, 0, movedSource);

        return {
          ...categoryNode,
          children: nextSources,
        };
      });
    });
  };

  const moveFeedToCategory = async (key: string, category: string) => {
    const sourceNode = flattenCategoryFeeds(categories).find((node) => node.key === key);
    const sourceUrl = sourceNode?.data?.url;
    const sourceName = sourceNode?.label?.trim();
    const nextCategory = category.trim();

    if (!sourceUrl || !sourceName || !nextCategory) {
      return;
    }

    try {
      await FeedService.createFeedSource({
        name: sourceName,
        url: sourceUrl,
        category: nextCategory,
      });

      const nextCategories = await loadFeedSources();
      const movedNode = flattenCategoryFeeds(nextCategories).find(
        (node) => node.data?.url === sourceUrl,
      );

      if (movedNode?.data?.url) {
        setSelectedCategory(movedNode.key);
        await fetchFeed(movedNode.data.url);
      }

      toast.success("Feed category updated.");
    } catch (err) {
      console.error("Move feed category error:", err);
      toast.error("Unable to update feed category.");
    }
  };

  const importOpmlFeeds = async (entries: OpmlFeedImportEntry[]) => {
    if (entries.length === 0) {
      toast.error("No valid feeds found in OPML file.");
      return;
    }

    const previousSelectedSourceUrl = flattenCategoryFeeds(categories).find(
      (node) => node.key === selectedCategory,
    )?.data?.url;

    let importedCount = 0;
    let failedCount = 0;
    const successfulUrls: string[] = [];
    const importedCategoryLabels = new Set<string>();

    for (const entry of entries) {
      try {
        await FeedService.createFeedSource({
          name: entry.name.trim(),
          url: entry.url.trim(),
          category: entry.category.trim() || DEFAULT_CATEGORY_LABEL,
        });

        successfulUrls.push(entry.url.trim());
        importedCategoryLabels.add(entry.category.trim() || DEFAULT_CATEGORY_LABEL);
        importedCount += 1;
      } catch (error) {
        failedCount += 1;
        console.error("OPML import item failed:", entry, error);
      }
    }

    if (importedCount === 0) {
      toast.error("Unable to import feeds from OPML.");
      return;
    }

    if (importedCategoryLabels.size > 0) {
      setCustomCategoryLabels((current) => {
        const existing = new Set(current.map((label) => normalizeLabel(label)));
        const next = [...current];

        for (const label of importedCategoryLabels) {
          if (!existing.has(normalizeLabel(label))) {
            next.push(label);
            existing.add(normalizeLabel(label));
          }
        }

        return next;
      });
    }

    const nextCategories = await loadFeedSources();
    const restoredSelection = previousSelectedSourceUrl
      ? flattenCategoryFeeds(nextCategories).find(
          (node) => node.data?.url === previousSelectedSourceUrl,
        )
      : null;
    const importedSelection = flattenCategoryFeeds(nextCategories).find((node) =>
      successfulUrls.includes(node.data?.url ?? ""),
    );
    const nextSelection = importedSelection ?? restoredSelection;

    if (nextSelection?.data?.url) {
      setSelectedCategory(nextSelection.key);
      await fetchFeed(nextSelection.data.url);
    }

    if (failedCount > 0) {
      toast.success(`Imported ${importedCount} feeds (${failedCount} skipped).`);
      return;
    }

    toast.success(`Imported ${importedCount} feeds from OPML.`);
  };

  const addCategory = (label: string) => {
    const normalized = label.trim();
    if (!normalized) {
      toast.error("Category name is required.");
      return false;
    }

    const existing = new Set([
      ...categories.map((node) => normalizeLabel(node.label)),
      ...customCategoryLabels.map((node) => normalizeLabel(node)),
    ]);

    if (existing.has(normalizeLabel(normalized))) {
      toast.error("Category already exists.");
      return false;
    }

    setCustomCategoryLabels((current) => [...current, normalized]);
    toast.success("Category added.");
    return true;
  };

  const renameCategory = async (currentLabel: string, nextLabel: string) => {
    const normalizedCurrent = currentLabel.trim();
    const normalizedNext = nextLabel.trim();

    if (!normalizedCurrent || !normalizedNext) {
      toast.error("Category name is required.");
      return false;
    }

    if (normalizeLabel(normalizedCurrent) === normalizeLabel(normalizedNext)) {
      return false;
    }

    const allLabels = new Set([
      ...categories.map((node) => normalizeLabel(node.label)),
      ...customCategoryLabels.map((node) => normalizeLabel(node)),
    ]);

    if (allLabels.has(normalizeLabel(normalizedNext))) {
      toast.error("Category already exists.");
      return false;
    }

    const categoryNode = categories.find(
      (node) => normalizeLabel(node.label) === normalizeLabel(normalizedCurrent),
    );
    const feedsInCategory = categoryNode?.children ?? [];
    const previousSelectedSourceUrl = flattenCategoryFeeds(categories).find(
      (node) => node.key === selectedCategory,
    )?.data?.url;

    try {
      let refreshedCategories: CategoryTreeNode[] | null = null;

      if (feedsInCategory.length > 0) {
        await Promise.all(
          feedsInCategory
            .filter((feedNode) => Boolean(feedNode.data?.url))
            .map((feedNode) =>
              FeedService.createFeedSource({
                name: feedNode.label,
                url: feedNode.data?.url ?? "",
                category: normalizedNext,
              }),
            ),
        );
        refreshedCategories = await loadFeedSources();
      }

      setCustomCategoryLabels((current) =>
        current.map((label) =>
          normalizeLabel(label) === normalizeLabel(normalizedCurrent) ? normalizedNext : label,
        ),
      );
      setOrderedCategoryLabels((current) =>
        current.map((label) =>
          normalizeLabel(label) === normalizeLabel(normalizedCurrent) ? normalizedNext : label,
        ),
      );

      if (previousSelectedSourceUrl) {
        if (!refreshedCategories) {
          refreshedCategories = await loadFeedSources();
        }

        const selectedNode = flattenCategoryFeeds(refreshedCategories).find(
          (node) => node.data?.url === previousSelectedSourceUrl,
        );

        if (selectedNode) {
          setSelectedCategory(selectedNode.key);
        }
      }

      toast.success("Category updated.");
      return true;
    } catch (err) {
      console.error("Rename category error:", err);
      toast.error("Unable to rename category.");
      return false;
    }
  };

  const moveCategory = (label: string, direction: "up" | "down") => {
    setOrderedCategoryLabels((current) => {
      const currentIndex = current.findIndex(
        (currentLabel) => normalizeLabel(currentLabel) === normalizeLabel(label),
      );

      if (currentIndex < 0) {
        return current;
      }

      const nextIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
      if (nextIndex < 0 || nextIndex >= current.length) {
        return current;
      }

      const next = [...current];
      const [moved] = next.splice(currentIndex, 1);
      next.splice(nextIndex, 0, moved);
      return next;
    });
  };

  const removeCategory = (label: string) => {
    const categoryNode = categories.find(
      (node) => normalizeLabel(node.label) === normalizeLabel(label),
    );
    const feedCount = (categoryNode?.children ?? []).length;

    if (feedCount > 0) {
      toast.error("Move or remove feeds in this category first.");
      return false;
    }

    setCustomCategoryLabels((current) =>
      current.filter((currentLabel) => normalizeLabel(currentLabel) !== normalizeLabel(label)),
    );
    setOrderedCategoryLabels((current) =>
      current.filter((currentLabel) => normalizeLabel(currentLabel) !== normalizeLabel(label)),
    );
    toast.success("Category removed.");
    return true;
  };

  const fetchFeed = async (url: string = DEFAULT_FEED_URL) => {
    setLoading(true);
    setFeed([]);
    setIsUsingDevPlaceholder(false);

    try {
      const articles = await FeedService.getFeed(url);

      if (ENV.isDevelopment && articles.length === 0) {
        setFeed(getDevPlaceholderArticlesForSource(url));
        setIsUsingDevPlaceholder(true);
        setExpandedArticleKey(null);
        return;
      }

      setFeed(articles);
      setExpandedArticleKey(null);
    } catch (err) {
      if (ENV.isDevelopment) {
        setFeed(getDevPlaceholderArticlesForSource(url));
        setIsUsingDevPlaceholder(true);
        setExpandedArticleKey(null);
        toast.info("Showing development placeholder content.", {
          description: "Feed request failed, so mock articles are displayed.",
        });
        console.error("Feed fetch error (using dev placeholders):", err);
        return;
      }

      toast.error("Unable to load this feed right now.", {
        description: "Please try refreshing the selected source again.",
      });
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
    (article.content || "").toLowerCase().includes(searchTerm.toLowerCase())
  );

  useEffect(() => {
    const initializeDashboard = async () => {
      const loadedCategories = await loadFeedSources();
      const firstCategory = flattenCategoryFeeds(loadedCategories)[0];
      const nextSelectedKey = firstCategory?.key ?? "";
      const nextFeedUrl = firstCategory?.data?.url ?? DEFAULT_FEED_URL;

      setCategories(loadedCategories);
      setSelectedCategory(nextSelectedKey);
      await fetchFeed(nextFeedUrl);
    };

    initializeDashboard();
  }, []);

  useEffect(() => {
    const uniqueLabels = [
      ...categories.map((node) => node.label),
      ...customCategoryLabels.filter(
        (label) =>
          !categories.some((existing) => normalizeLabel(existing.label) === normalizeLabel(label)),
      ),
    ].filter((label, index, allLabels) => {
      return (
        allLabels.findIndex((candidate) => normalizeLabel(candidate) === normalizeLabel(label)) === index
      );
    });

    setOrderedCategoryLabels((current) => {
      const preserved = current.filter((label) =>
        uniqueLabels.some((candidate) => normalizeLabel(candidate) === normalizeLabel(label)),
      );
      const additions = uniqueLabels.filter(
        (label) => !preserved.some((candidate) => normalizeLabel(candidate) === normalizeLabel(label)),
      );

      return [...preserved, ...additions];
    });
  }, [categories, customCategoryLabels]);

  const availableSources = flattenCategoryFeeds(categories);
  const selectedFeedNode = availableSources.find((c) => c.key === selectedCategory);
  const selectedFeedUrl = selectedFeedNode?.data?.url;
  const selectedFeed = selectedFeedNode?.label;
  const categoryMap = new Map<string, CategoryTreeNode>();
  categories.forEach((categoryNode) => {
    categoryMap.set(normalizeLabel(categoryNode.label), categoryNode);
  });
  customCategoryLabels
    .filter(
      (label) => !categories.some((existing) => normalizeLabel(existing.label) === normalizeLabel(label)),
    )
    .forEach((label) => {
      categoryMap.set(normalizeLabel(label), {
        key: toCategoryKey(label),
        label,
        children: [] as CategoryTreeNode[],
      });
    });

  const orderedLabels =
    orderedCategoryLabels.length > 0
      ? orderedCategoryLabels
      : [...categoryMap.values()].map((categoryNode) => categoryNode.label);

  const displayCategories = orderedLabels
    .map((label) => categoryMap.get(normalizeLabel(label)))
    .filter((categoryNode): categoryNode is CategoryTreeNode => Boolean(categoryNode));
  const categoryOptions = displayCategories.map((categoryNode) => categoryNode.label);

  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent("dashboard:title-change", {
        detail: { title: selectedFeed ?? "LibreRSS" },
      }),
    );
  }, [selectedFeed]);

  useEffect(() => {
    const handleRefresh = () => {
      fetchFeed(selectedFeedUrl ?? DEFAULT_FEED_URL);
    };

    const handleOpenSettings = () => {
      setShowSettingsModal(true);
    };

    const handleSearchChange = (event: Event) => {
      const customEvent = event as CustomEvent<{ term?: string }>;
      setSearchTerm(customEvent.detail?.term ?? "");
    };

    window.addEventListener("dashboard:refresh", handleRefresh);
    window.addEventListener("dashboard:open-settings", handleOpenSettings);
    window.addEventListener("dashboard:search-change", handleSearchChange as EventListener);

    return () => {
      window.removeEventListener("dashboard:refresh", handleRefresh);
      window.removeEventListener("dashboard:open-settings", handleOpenSettings);
      window.removeEventListener("dashboard:search-change", handleSearchChange as EventListener);
    };
  }, [selectedFeedUrl]);

  useEffect(() => {
    window.dispatchEvent(new CustomEvent("dashboard:search-sync", { detail: { term: searchTerm } }));
  }, [searchTerm]);

  useEffect(() => {
    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;

    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
    };
  }, []);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setIsSidebarVisible(true);
    });

    return () => window.cancelAnimationFrame(frame);
  }, []);

  return (
    <motion.div
      className="mx-auto flex h-full max-w-6xl flex-col overflow-hidden px-4 pb-6 pt-20 md:px-6"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: "easeOut" }}
    >

      {/* Main layout */}
      <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-hidden lg:flex-row lg:items-stretch">
        {/* Sidebar */}
        <aside className="min-h-0 overflow-hidden lg:w-[220px] lg:shrink-0">
          <div
            className={`h-full overflow-y-auto pr-3 transition-opacity duration-300 ease-out ${isSidebarVisible ? "opacity-100" : "opacity-0"
              }`}
          >
            <div className="space-y-4">
              {displayCategories.length === 0 ? (
                <div className="px-2 py-8 text-xs text-muted-foreground/70">No feed sources yet.</div>
              ) : (
                displayCategories.map((categoryNode, index) => (
                  <div
                    key={categoryNode.key}
                    className={`space-y-1 transition-opacity duration-300 ease-out ${isSidebarVisible ? "opacity-100" : "opacity-0"
                      }`}
                    style={{ transitionDelay: `${index * 35}ms` }}
                  >
                    <p className="px-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground/60">
                      {categoryNode.label}
                    </p>
                    {(categoryNode.children ?? []).map((feedNode) => (
                      <FeedCategory
                        key={feedNode.key}
                        category={feedNode}
                        isActive={selectedCategory === feedNode.key}
                        onClick={() => handleCategoryClick(feedNode)}
                      />
                    ))}
                  </div>
                ))
              )}
            </div>
          </div>
        </aside>

        <Separator orientation="vertical" className="hidden lg:block" />

        {/* Feed area */}
        <motion.section
          className="flex min-h-0 flex-1 flex-col overflow-hidden lg:min-w-0"
          initial={panelMotion.initial}
          animate={panelMotion.animate}
          transition={{ duration: 0.45, ease: "easeOut", delay: 0.1 }}
        >

          <ScrollArea className="min-h-0 flex-1">
            {loading ? (
              <div className="grid grid-cols-1 gap-2 pr-3 py-2">
                {Array.from({ length: 6 }).map((_, index) => (
                  <div key={index} className="rounded-xl border bg-card/40 p-3">
                    <div className="h-3 w-1/3 rounded bg-muted/60" />
                    <div className="mt-2 h-4 w-5/6 rounded bg-muted/70" />
                    <div className="mt-3 space-y-2">
                      <div className="h-3 w-full rounded bg-muted/50" />
                      <div className="h-3 w-4/5 rounded bg-muted/50" />
                      <div className="h-3 w-2/3 rounded bg-muted/50" />
                    </div>
                  </div>
                ))}
              </div>
            ) : filteredFeed.length === 0 ? (
              <div className="flex items-center justify-center py-32">
                <div className="text-center space-y-2">
                  <p className="text-sm text-muted-foreground">
                    {searchTerm ? "No matches." : "No articles yet."}
                  </p>
                  {searchTerm ? (
                    <button
                      onClick={() => setSearchTerm("")}
                      className="text-xs text-muted-foreground/60 underline underline-offset-2"
                    >
                      Clear search
                    </button>
                  ) : (
                    <button
                      onClick={() => fetchFeed(selectedFeedUrl ?? DEFAULT_FEED_URL)}
                      className="text-xs text-muted-foreground/60 underline underline-offset-2"
                    >
                      Refresh
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-2 pr-3">
                {filteredFeed.map((article, index) => {
                  const cardKey = `${article.link}-${index}`;
                  return (
                    <ArticleCard
                      key={cardKey}
                      article={article}
                      isExpanded={expandedArticleKey === cardKey}
                      onToggle={() =>
                        setExpandedArticleKey((current) =>
                          current === cardKey ? null : cardKey,
                        )
                      }
                    />
                  );
                })}
              </div>
            )}
          </ScrollArea>
        </motion.section>
      </div>

      {showSettingsModal && (
        <SettingsModal
          onClose={() => setShowSettingsModal(false)}
          categories={displayCategories}
          categoryOptions={categoryOptions}
          selectedCategory={selectedCategory}
          onImportOpml={importOpmlFeeds}
          onSelectFeed={selectFeedByKey}
          onMoveFeed={moveFeedSource}
          onMoveFeedToCategory={moveFeedToCategory}
          onAddFeed={addFeedSource}
          onAddCategory={addCategory}
          onRenameCategory={renameCategory}
          onMoveCategory={moveCategory}
          onRemoveCategory={removeCategory}
          onRemoveFeed={removeFeedSource}
        />
      )}
    </motion.div>
  );
};

function DashboardRouter() {
  const searchParams = useSearchParams();
  const view = searchParams?.get("view") || "dashboard";
  const [isSessionLoading, setIsSessionLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [allowSignup, setAllowSignup] = useState(true);

  useEffect(() => {
    const loadSession = async () => {
      try {
        const session = await AuthService.getSession();
        setAllowSignup(session.allowSignup);
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

  if (isSessionLoading) {
    return (
      <main className="h-full overflow-hidden bg-background">
        <div className="flex h-full items-center justify-center">
          <Loader2 className="size-4 animate-spin text-muted-foreground/40" />
        </div>
      </main>
    );
  }

  if (!currentUser) {
    return (
      <main className="h-full overflow-hidden bg-background">
        <LoginView onAuthenticated={setCurrentUser} allowSignup={allowSignup} />
      </main>
    );
  }

  return (
    <main className="h-full overflow-hidden bg-background">
      {view === "settings" ? (
        <SettingsView />
      ) : (
        <DashboardView />
      )}
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
