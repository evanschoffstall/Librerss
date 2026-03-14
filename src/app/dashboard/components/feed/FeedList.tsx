"use client";

import { SearchX, Sparkles } from "lucide-react";
import { useTheme } from "next-themes";
import {
  type ComponentPropsWithoutRef,
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Virtuoso } from "react-virtuoso";

import {
  ARTICLE_DEEXPAND_REMOVAL_ANIMATION_MS,
  ARTICLE_REMOVAL_ANIMATION_MS,
  type ArticleRemovalAnimationMode,
  getArticleRemovalAnimationDuration,
} from "../../hooks/useArticleActions";
import { getArticleKey } from "../../services/article-collection";
import { ArticleCard } from "../ArticleCard";
import { DashboardFeedListSkeleton } from "../DashboardLoadingSurfaces";

import { type Article } from "@/lib";
import { useIsMobile } from "@/lib/hooks/useIsMobile";

interface FeedListProps {
  collapsingArticleKey?: null | string;
  collapsingArticleMode?: ArticleRemovalAnimationMode | null;
  expandedArticleKey: null | string;
  filteredFeed: Article[];
  hydratedArticleLinks: Record<string, boolean>;
  hydratingArticleLinks: Record<string, boolean>;
  isInitialLoading: boolean;
  isRefreshing: boolean;
  onExpandedSwipeRead: (article: Article) => void;
  onSwipeRead?: (article: Article) => void;
  onToggle: (article: Article) => void;
  onToggleRead: (article: Article) => void;
  onToggleStarred: (article: Article) => void;
  pageSize: number;
  paginationResetKey: string;
  searchTerm: string;
  showFavicons: boolean;
  updatingArticleState: Record<string, boolean>;
}

interface FeedLoadMoreState {
  clientHeight: number;
  hasUserScrolled: boolean;
  scrollHeight: number;
  scrollTop: number;
  totalArticleCount: number;
  visibleArticleCount: number;
}

/** Minimum off-screen preload budget for the virtualized feed list. */
const VIRTUAL_FEED_MIN_PRELOAD_PX = 720;
/** Approximate row height used to convert the page-size preference into preload distance. */
const VIRTUAL_FEED_ROW_ESTIMATE_PX = 168;
/** Viewport distance from the bottom that should trigger the next page load. */
const FEED_LOAD_MORE_THRESHOLD_PX = VIRTUAL_FEED_ROW_ESTIMATE_PX * 3;
const FEED_ROW_EXIT_EASING = "cubic-bezier(0.22, 1, 0.36, 1)";
const FEED_ROW_COLLAPSE_HEIGHT_DELAY_MS = 90;
const FEED_ROW_COLLAPSE_FLOOR_PX = 12;
const FEED_ROW_GAP_PX = 6;
const FEED_ROW_COLLAPSE_OFFSET_PX =
  FEED_ROW_COLLAPSE_FLOOR_PX + FEED_ROW_GAP_PX;
const FEED_ROW_SWIPE_EXIT_DISTANCE = "calc(100% + 4rem)";
const FEED_ROW_SWIPE_EXIT_EASING = "cubic-bezier(0.2, 0, 0, 1)";
const FEED_VIRTUALIZED_FALLBACK_ROW_PX = Math.max(
  FEED_ROW_COLLAPSE_FLOOR_PX,
  VIRTUAL_FEED_ROW_ESTIMATE_PX,
);

interface FeedListRowProps {
  articleKey: string;
  children: React.ReactNode;
  initialMeasuredHeight?: number;
  onMeasuredHeightChange?: (height: number) => void;
  onRemovalTransitionComplete?: (articleKey: string) => void;
  removalAnimationMode: ArticleRemovalAnimationMode | null;
}

interface RetainedCollapsingArticle {
  article: Article;
  height: null | number;
  index: number;
  source: "retained" | "visible";
}

/**
 * Keeps react-virtuoso from recording impossible zero-height rows during list
 * churn, which otherwise triggers console errors and extra measurement passes.
 */
export function measureFeedListItemSize(element: Element): number {
  return Math.max(
    element.getBoundingClientRect().height,
    FEED_ROW_COLLAPSE_FLOOR_PX,
  );
}

/**
 * Preserves the row long enough for unread removals to collapse out of the feed
 * instead of disappearing on the next virtual-list diff.
 */
const FeedListRow = memo(function FeedListRow({
  articleKey,
  children,
  initialMeasuredHeight,
  onMeasuredHeightChange,
  onRemovalTransitionComplete,
  removalAnimationMode,
}: FeedListRowProps) {
  const contentRef = useRef<HTMLDivElement | null>(null);
  const removalActivationTimeoutRef = useRef<null | number>(null);
  const hasCompletedRemovalRef = useRef(false);
  const isRemoving = removalAnimationMode !== null;
  const isDeExpandingHold = removalAnimationMode === "de-expanding";
  const isSwipeReadExit = removalAnimationMode === "swipe-read";
  const contentId = useId();
  const stableHeightRef = useRef(initialMeasuredHeight ?? 0);
  const [measuredHeight, setMeasuredHeight] = useState<null | number>(
    initialMeasuredHeight ?? null,
  );
  const [removalHeight, setRemovalHeight] = useState<null | number>(
    isRemoving ? (initialMeasuredHeight ?? null) : null,
  );
  const [isRemovalTransitionActive, setIsRemovalTransitionActive] =
    useState(false);

  useLayoutEffect(() => {
    const node = contentRef.current;
    if (!node) return;

    const updateMeasuredHeight = () => {
      const nextHeight = node.offsetHeight;
      stableHeightRef.current = nextHeight;
      setMeasuredHeight(nextHeight);
      onMeasuredHeightChange?.(nextHeight);
    };

    updateMeasuredHeight();

    if (typeof ResizeObserver !== "function") return;

    const observer = new ResizeObserver(() => {
      updateMeasuredHeight();
    });
    observer.observe(node);
    return () => {
      observer.disconnect();
    };
  }, [children, onMeasuredHeightChange]);

  useEffect(() => {
    hasCompletedRemovalRef.current = false;
  }, [articleKey, removalAnimationMode]);

  useEffect(() => {
    if (!isRemoving) {
      if (removalActivationTimeoutRef.current !== null) {
        window.clearTimeout(removalActivationTimeoutRef.current);
        removalActivationTimeoutRef.current = null;
      }
      setIsRemovalTransitionActive(false);
      setRemovalHeight(null);
      return;
    }

    const nextRemovalHeight =
      contentRef.current?.offsetHeight ??
      measuredHeight ??
      stableHeightRef.current;

    setRemovalHeight(
      nextRemovalHeight > 0 ? nextRemovalHeight : FEED_ROW_COLLAPSE_FLOOR_PX,
    );
    setIsRemovalTransitionActive(false);
    removalActivationTimeoutRef.current = window.setTimeout(() => {
      setIsRemovalTransitionActive(true);
      removalActivationTimeoutRef.current = null;
    }, 0);

    return () => {
      if (removalActivationTimeoutRef.current !== null) {
        window.clearTimeout(removalActivationTimeoutRef.current);
        removalActivationTimeoutRef.current = null;
      }
    };
  }, [isDeExpandingHold, isRemoving]);

  const resolvedRemovalHeight =
    removalHeight ?? measuredHeight ?? stableHeightRef.current;
  const currentMaxHeight = isRemoving
    ? `${
        isRemovalTransitionActive
          ? FEED_ROW_COLLAPSE_FLOOR_PX
          : Math.max(resolvedRemovalHeight, FEED_ROW_COLLAPSE_FLOOR_PX)
      }px`
    : undefined;
  const currentMarginBottom = isRemoving
    ? `${
        isRemovalTransitionActive
          ? -FEED_ROW_COLLAPSE_OFFSET_PX
          : FEED_ROW_GAP_PX
      }px`
    : `${FEED_ROW_GAP_PX}px`;
  const currentOpacity = isRemoving && isRemovalTransitionActive ? 0 : 1;
  const currentTransform = isDeExpandingHold
    ? undefined
    : isRemoving
      ? isRemovalTransitionActive
        ? isSwipeReadExit
          ? `translate3d(${FEED_ROW_SWIPE_EXIT_DISTANCE}, 0, 0)`
          : "scale(0.985)"
        : "translateY(0) scale(1)"
      : undefined;

  return (
    <div
      data-feed-row-animation={removalAnimationMode ?? "idle"}
      data-feed-row-state={isRemoving ? "collapsing" : "idle"}
      data-scroll-restore-key={articleKey}
      onTransitionEnd={(event) => {
        if (
          !isRemoving ||
          !isRemovalTransitionActive ||
          hasCompletedRemovalRef.current
        ) {
          return;
        }

        const settledProperty = isSwipeReadExit ? "transform" : "max-height";
        if (event.propertyName !== settledProperty) {
          return;
        }

        hasCompletedRemovalRef.current = true;
        onRemovalTransitionComplete?.(articleKey);
      }}
      style={{
        marginBottom: isDeExpandingHold
          ? `${
              isRemovalTransitionActive
                ? -FEED_ROW_COLLAPSE_OFFSET_PX
                : FEED_ROW_GAP_PX
            }px`
          : currentMarginBottom,
        maxHeight: isDeExpandingHold
          ? `${
              isRemovalTransitionActive
                ? FEED_ROW_COLLAPSE_FLOOR_PX
                : Math.max(resolvedRemovalHeight, FEED_ROW_COLLAPSE_FLOOR_PX)
            }px`
          : currentMaxHeight,
        minHeight:
          isRemoving && isRemovalTransitionActive
            ? `${FEED_ROW_COLLAPSE_FLOOR_PX}px`
            : undefined,
        opacity: currentOpacity,
        overflow: isRemoving ? "hidden" : "visible",
        pointerEvents: isRemoving ? "none" : undefined,
        transform: isDeExpandingHold ? undefined : currentTransform,
        transformOrigin: isSwipeReadExit ? "center left" : "top center",
        transition: isRemoving
          ? isDeExpandingHold
            ? [
                `max-height ${ARTICLE_DEEXPAND_REMOVAL_ANIMATION_MS}ms ${FEED_ROW_EXIT_EASING}`,
                `margin-bottom ${ARTICLE_DEEXPAND_REMOVAL_ANIMATION_MS}ms ${FEED_ROW_EXIT_EASING}`,
                `opacity ${ARTICLE_DEEXPAND_REMOVAL_ANIMATION_MS}ms ease-out`,
              ].join(", ")
            : isSwipeReadExit
              ? [
                  `max-height ${Math.round(ARTICLE_REMOVAL_ANIMATION_MS * 0.56)}ms ${FEED_ROW_EXIT_EASING} ${Math.round(ARTICLE_REMOVAL_ANIMATION_MS * 0.44)}ms`,
                  `margin-bottom ${Math.round(ARTICLE_REMOVAL_ANIMATION_MS * 0.56)}ms ${FEED_ROW_EXIT_EASING} ${Math.round(ARTICLE_REMOVAL_ANIMATION_MS * 0.44)}ms`,
                  `opacity ${Math.round(ARTICLE_REMOVAL_ANIMATION_MS * 0.72)}ms ease-out`,
                  `transform ${ARTICLE_REMOVAL_ANIMATION_MS}ms ${FEED_ROW_SWIPE_EXIT_EASING}`,
                ].join(", ")
              : [
                  `max-height ${ARTICLE_REMOVAL_ANIMATION_MS - FEED_ROW_COLLAPSE_HEIGHT_DELAY_MS}ms ${FEED_ROW_EXIT_EASING} ${FEED_ROW_COLLAPSE_HEIGHT_DELAY_MS}ms`,
                  `margin-bottom ${ARTICLE_REMOVAL_ANIMATION_MS - FEED_ROW_COLLAPSE_HEIGHT_DELAY_MS}ms ${FEED_ROW_EXIT_EASING} ${FEED_ROW_COLLAPSE_HEIGHT_DELAY_MS}ms`,
                  `opacity ${Math.round(ARTICLE_REMOVAL_ANIMATION_MS * 0.72)}ms ease-out`,
                  `transform ${ARTICLE_REMOVAL_ANIMATION_MS}ms ${FEED_ROW_EXIT_EASING}`,
                ].join(", ")
          : undefined,
        willChange: isRemoving
          ? isDeExpandingHold
            ? "max-height, margin-bottom, opacity"
            : "max-height, opacity, transform, margin-bottom"
          : undefined,
      }}
    >
      <div id={contentId} ref={contentRef}>
        {children}
      </div>
    </div>
  );
});

/**
 * Returns whether the visible feed window should expand based on the current
 * viewport position and paging state.
 */
export function shouldLoadMoreArticles({
  clientHeight,
  hasUserScrolled,
  scrollHeight,
  scrollTop,
  totalArticleCount,
  visibleArticleCount,
}: FeedLoadMoreState): boolean {
  if (!hasUserScrolled || visibleArticleCount >= totalArticleCount) {
    return false;
  }

  const remainingDistance = scrollHeight - (scrollTop + clientHeight);

  return (
    Number.isFinite(remainingDistance) &&
    remainingDistance <= FEED_LOAD_MORE_THRESHOLD_PX
  );
}

/**
 * Grid wrapper used by the virtualized list so article cards keep the existing layout.
 */
const FeedVirtuosoList = forwardRef<
  HTMLDivElement,
  ComponentPropsWithoutRef<"div">
>(function FeedVirtuosoList({ className, ...props }, ref) {
  return (
    <div
      {...props}
      className={
        [
          "relative mx-auto grid w-full max-w-3xl grid-cols-1 px-1 lg:max-w-none lg:px-3",
          className,
        ]
          .filter(Boolean)
          .join(" ") || undefined
      }
      ref={ref}
    />
  );
});

export const FeedList = memo(function FeedList({
  collapsingArticleKey = null,
  collapsingArticleMode = null,
  expandedArticleKey,
  filteredFeed,
  hydratedArticleLinks,
  hydratingArticleLinks,
  isInitialLoading,
  isRefreshing: _isRefreshing,
  onExpandedSwipeRead,
  onSwipeRead,
  onToggle,
  onToggleRead,
  onToggleStarred,
  pageSize,
  paginationResetKey,
  searchTerm,
  showFavicons,
  updatingArticleState,
}: FeedListProps) {
  const isMobile = useIsMobile();
  const { resolvedTheme } = useTheme();
  const isDark = (resolvedTheme ?? "dark") === "dark";
  const [scrollViewport, setScrollViewport] = useState<HTMLElement | null>(
    null,
  );
  const [visibleArticleCount, setVisibleArticleCount] = useState(pageSize);
  const collapseDisplayTimeoutRef = useRef<null | number>(null);
  const hasUserScrolledRef = useRef(false);
  const [completedRemovalArticleKey, setCompletedRemovalArticleKey] = useState<
    null | string
  >(null);
  const [displayedCollapsingArticleKey, setDisplayedCollapsingArticleKey] =
    useState<null | string>(collapsingArticleKey);
  const [displayedCollapsingArticleMode, setDisplayedCollapsingArticleMode] =
    useState<ArticleRemovalAnimationMode | null>(collapsingArticleMode);
  const [pinnedTopCollapsingArticle, setPinnedTopCollapsingArticle] =
    useState<null | RetainedCollapsingArticle>(null);
  const retainedVisibleArticleHeightsRef = useRef(new Map<string, number>());
  const retainedVisibleArticlesRef = useRef(new Map<string, Article>());
  const retainedVisibleArticleIndicesRef = useRef(new Map<string, number>());
  useEffect(
    () => () => {
      if (collapseDisplayTimeoutRef.current !== null) {
        window.clearTimeout(collapseDisplayTimeoutRef.current);
      }
    },
    [],
  );

  useEffect(() => {
    if (!collapsingArticleKey) {
      setCompletedRemovalArticleKey(null);
      return;
    }

    setCompletedRemovalArticleKey((currentKey) =>
      currentKey === collapsingArticleKey ? currentKey : null,
    );
  }, [collapsingArticleKey]);

  useEffect(() => {
    if (!collapsingArticleKey) {
      return;
    }

    const collapseDisplayDuration = collapsingArticleMode
      ? getArticleRemovalAnimationDuration(collapsingArticleMode)
      : ARTICLE_REMOVAL_ANIMATION_MS;

    if (collapseDisplayTimeoutRef.current !== null) {
      window.clearTimeout(collapseDisplayTimeoutRef.current);
    }

    setDisplayedCollapsingArticleKey(collapsingArticleKey);
    setDisplayedCollapsingArticleMode(collapsingArticleMode);
    collapseDisplayTimeoutRef.current = window.setTimeout(() => {
      setDisplayedCollapsingArticleKey(null);
      setDisplayedCollapsingArticleMode(null);
      collapseDisplayTimeoutRef.current = null;
    }, collapseDisplayDuration);
  }, [collapsingArticleKey, collapsingArticleMode]);
  const pendingCollapsingArticleKey =
    collapsingArticleKey ?? displayedCollapsingArticleKey;
  const pendingCollapsingArticleMode =
    collapsingArticleMode ?? displayedCollapsingArticleMode;
  const activeCollapsingArticleKey =
    completedRemovalArticleKey === pendingCollapsingArticleKey
      ? null
      : pendingCollapsingArticleKey;
  const activeCollapsingArticleMode =
    activeCollapsingArticleKey === null ? null : pendingCollapsingArticleMode;
  const shouldPinTopCollapsingArticle =
    activeCollapsingArticleMode !== "de-expanding";

  const visibleFeed = useMemo(
    () => filteredFeed.slice(0, visibleArticleCount),
    [filteredFeed, visibleArticleCount],
  );
  const collapsingArticleSnapshot =
    useMemo<null | RetainedCollapsingArticle>(() => {
      if (!activeCollapsingArticleKey) {
        return null;
      }

      const visibleArticleIndex = visibleFeed.findIndex(
        (article) => getArticleKey(article) === activeCollapsingArticleKey,
      );
      if (visibleArticleIndex >= 0) {
        return {
          article: visibleFeed[visibleArticleIndex],
          height:
            retainedVisibleArticleHeightsRef.current.get(
              activeCollapsingArticleKey,
            ) ?? null,
          index: visibleArticleIndex,
          source: "visible",
        };
      }

      const retainedArticle = retainedVisibleArticlesRef.current.get(
        activeCollapsingArticleKey,
      );
      if (!retainedArticle) {
        return null;
      }

      return {
        article: retainedArticle,
        height:
          retainedVisibleArticleHeightsRef.current.get(
            activeCollapsingArticleKey,
          ) ?? null,
        index:
          retainedVisibleArticleIndicesRef.current.get(
            activeCollapsingArticleKey,
          ) ?? visibleFeed.length,
        source: "retained",
      };
    }, [activeCollapsingArticleKey, visibleFeed]);
  useEffect(() => {
    if (
      !scrollViewport ||
      !activeCollapsingArticleKey ||
      !shouldPinTopCollapsingArticle
    ) {
      setPinnedTopCollapsingArticle(null);
      return;
    }

    if (collapsingArticleSnapshot?.index === 0) {
      setPinnedTopCollapsingArticle(collapsingArticleSnapshot);
      return;
    }

    setPinnedTopCollapsingArticle((currentPinnedArticle) => {
      if (
        currentPinnedArticle &&
        getArticleKey(currentPinnedArticle.article) ===
          activeCollapsingArticleKey
      ) {
        return currentPinnedArticle;
      }

      return null;
    });
  }, [
    activeCollapsingArticleKey,
    collapsingArticleSnapshot,
    scrollViewport,
    shouldPinTopCollapsingArticle,
  ]);
  const renderedFeed = useMemo(() => {
    if (!collapsingArticleSnapshot || pinnedTopCollapsingArticle) {
      return visibleFeed;
    }
    if (collapsingArticleSnapshot.source === "visible") {
      return visibleFeed;
    }
    const insertIndex =
      collapsingArticleSnapshot.index === undefined
        ? visibleFeed.length
        : Math.min(collapsingArticleSnapshot.index, visibleFeed.length);
    const nextRenderedFeed = [...visibleFeed];
    nextRenderedFeed.splice(insertIndex, 0, collapsingArticleSnapshot.article);
    return nextRenderedFeed;
  }, [collapsingArticleSnapshot, pinnedTopCollapsingArticle, visibleFeed]);
  const virtualizedFeed = useMemo(() => {
    if (!pinnedTopCollapsingArticle || !activeCollapsingArticleKey) {
      return renderedFeed;
    }

    return renderedFeed.filter(
      (article) => getArticleKey(article) !== activeCollapsingArticleKey,
    );
  }, [activeCollapsingArticleKey, pinnedTopCollapsingArticle, renderedFeed]);
  const virtualFeedPreload = useMemo(
    () =>
      Math.max(
        VIRTUAL_FEED_MIN_PRELOAD_PX,
        pageSize * VIRTUAL_FEED_ROW_ESTIMATE_PX,
      ),
    [pageSize],
  );

  /**
   * Grows the rendered article window by exactly one page while retaining the
   * full selection in memory for later infinite-scroll steps.
   */
  const expandVisibleWindow = useCallback(() => {
    setVisibleArticleCount((currentCount) => {
      if (currentCount >= filteredFeed.length) {
        return currentCount;
      }

      return Math.min(currentCount + pageSize, filteredFeed.length);
    });
  }, [filteredFeed.length, pageSize]);

  useEffect(() => {
    hasUserScrolledRef.current = false;
    setVisibleArticleCount(pageSize);
  }, [pageSize, paginationResetKey]);

  useEffect(() => {
    const retainedVisibleArticles = retainedVisibleArticlesRef.current;
    const retainedVisibleArticleIndices =
      retainedVisibleArticleIndicesRef.current;
    const nextVisibleArticleKeys = visibleFeed.map((article, index) => {
      const articleKey = getArticleKey(article);
      retainedVisibleArticles.set(articleKey, article);
      retainedVisibleArticleIndices.set(articleKey, index);
      return articleKey;
    });

    const allowedKeys = new Set(nextVisibleArticleKeys);
    if (activeCollapsingArticleKey) {
      allowedKeys.add(activeCollapsingArticleKey);
    }

    for (const articleKey of retainedVisibleArticles.keys()) {
      if (!allowedKeys.has(articleKey)) {
        retainedVisibleArticles.delete(articleKey);
        retainedVisibleArticleIndices.delete(articleKey);
      }
    }
  }, [activeCollapsingArticleKey, visibleFeed]);

  useEffect(() => {
    if (!scrollViewport) {
      return;
    }

    const maybeLoadNextPage = () => {
      if (
        shouldLoadMoreArticles({
          clientHeight: scrollViewport.clientHeight,
          hasUserScrolled: hasUserScrolledRef.current,
          scrollHeight: scrollViewport.scrollHeight,
          scrollTop: scrollViewport.scrollTop,
          totalArticleCount: filteredFeed.length,
          visibleArticleCount,
        })
      ) {
        expandVisibleWindow();
      }
    };

    const handleScrollIntent = () => {
      hasUserScrolledRef.current = true;
      maybeLoadNextPage();
    };
    const handleViewportScroll = () => {
      if (scrollViewport.scrollTop > 0) {
        hasUserScrolledRef.current = true;
      }

      maybeLoadNextPage();
    };

    scrollViewport.addEventListener("scroll", handleViewportScroll, {
      passive: true,
    });
    scrollViewport.addEventListener("touchmove", handleScrollIntent, {
      passive: true,
    });
    scrollViewport.addEventListener("wheel", handleScrollIntent, {
      passive: true,
    });

    return () => {
      scrollViewport.removeEventListener("scroll", handleViewportScroll);
      scrollViewport.removeEventListener("touchmove", handleScrollIntent);
      scrollViewport.removeEventListener("wheel", handleScrollIntent);
    };
  }, [
    expandVisibleWindow,
    filteredFeed.length,
    scrollViewport,
    visibleArticleCount,
  ]);

  /**
   * Locates the Radix viewport so the virtualized list can reuse the existing
   * dashboard scroller instead of creating a nested scrolling surface.
   */
  const handleViewportHostRef = useCallback((node: HTMLDivElement | null) => {
    if (!node) {
      return;
    }

    const nextViewport =
      node?.closest<HTMLElement>("[data-radix-scroll-area-viewport]") ?? null;
    setScrollViewport((currentViewport) =>
      currentViewport === nextViewport ? currentViewport : nextViewport,
    );
  }, []);

  /**
   * Renders a single virtualized article row while preserving the scroll-restore key.
   */
  const renderArticleCard = useCallback(
    (article: Article, key?: string, initialMeasuredHeight?: number) => {
      const articleKey = getArticleKey(article);
      const articleLink = article.link.trim();

      return (
        <FeedListRow
          articleKey={articleKey}
          initialMeasuredHeight={initialMeasuredHeight}
          key={key ?? articleKey}
          onMeasuredHeightChange={(height) => {
            retainedVisibleArticleHeightsRef.current.set(articleKey, height);
          }}
          onRemovalTransitionComplete={(completedArticleKey) => {
            setCompletedRemovalArticleKey(completedArticleKey);
            setDisplayedCollapsingArticleKey((currentKey) =>
              currentKey === completedArticleKey ? null : currentKey,
            );
            setDisplayedCollapsingArticleMode((currentMode) =>
              articleKey === completedArticleKey ? null : currentMode,
            );
          }}
          removalAnimationMode={
            activeCollapsingArticleKey === articleKey
              ? activeCollapsingArticleMode
              : null
          }
        >
          <ArticleCard
            article={article}
            articleKey={articleKey}
            hasScrapedContent={hydratedArticleLinks[articleLink]}
            isDark={isDark}
            isExpanded={expandedArticleKey === articleKey}
            isHydrating={hydratingArticleLinks[articleLink]}
            isMobile={isMobile}
            isUpdatingState={updatingArticleState[articleKey]}
            onExpandedSwipeRead={onExpandedSwipeRead}
            onSwipeRead={onSwipeRead}
            onToggle={onToggle}
            onToggleRead={onToggleRead}
            onToggleStarred={onToggleStarred}
            removalAnimationMode={
              activeCollapsingArticleKey === articleKey
                ? activeCollapsingArticleMode
                : null
            }
            showFavicon={showFavicons}
            useRichFormatting={hydratedArticleLinks[articleLink]}
          />
        </FeedListRow>
      );
    },
    [
      collapsingArticleKey,
      collapsingArticleMode,
      expandedArticleKey,
      hydratedArticleLinks,
      hydratingArticleLinks,
      isDark,
      isMobile,
      onExpandedSwipeRead,
      onSwipeRead,
      onToggle,
      onToggleRead,
      onToggleStarred,
      showFavicons,
      updatingArticleState,
    ],
  );
  const getVirtualizedArticleKey = useCallback(
    (index: number, article?: Article) =>
      article ? getArticleKey(article) : `feed-missing-row-${index}`,
    [],
  );
  const renderVirtualizedArticleCard = useCallback(
    (index: number, article?: Article) =>
      article ? (
        renderArticleCard(article)
      ) : (
        <div
          aria-hidden="true"
          data-feed-missing-row={index}
          style={{ minHeight: `${FEED_VIRTUALIZED_FALLBACK_ROW_PX}px` }}
        />
      ),
    [renderArticleCard],
  );

  return (
    <>
      {isInitialLoading ? (
        <DashboardFeedListSkeleton />
      ) : renderedFeed.length === 0 && !pinnedTopCollapsingArticle ? (
        <div
          className="
            anim-fade-in-load-slow mx-auto flex w-full max-w-3xl items-center
            justify-center px-4 py-20
            sm:py-32
            lg:max-w-none lg:px-6 lg:py-40
          "
          key="feed-empty"
        >
          <div
            className="
              anim-fade-in-load-slow flex flex-col items-center gap-6
              text-center
            "
            key={searchTerm ? "empty-search" : "empty-default"}
          >
            {/* Icon with double-ring halo */}
            <div className="relative flex items-center justify-center">
              {/* Outer glow ring */}
              <div
                className={`
                  absolute size-36 rounded-full opacity-15 blur-2xl
                  ${searchTerm ? `bg-muted-foreground` : `bg-emerald-500`}
                `}
              />
              {/* Outer decorative ring */}
              <div
                className={`
                  absolute size-28 rounded-full border
                  ${searchTerm ? `border-border/40` : `border-emerald-500/10`}
                `}
              />
              {/* Icon card */}
              <div
                className={`
                  relative flex size-20 items-center justify-center rounded-2xl
                  border bg-card/70 shadow-md backdrop-blur-sm
                  ${searchTerm ? `border-border` : `border-emerald-500/25`}
                `}
              >
                {searchTerm ? (
                  <SearchX
                    className="size-9 text-muted-foreground/55"
                    strokeWidth={1.25}
                  />
                ) : (
                  <Sparkles
                    className="size-9 text-emerald-500/70"
                    strokeWidth={1.25}
                  />
                )}
              </div>
            </div>

            <div className="space-y-2">
              <h3
                className="
                text-xl font-semibold tracking-tight text-foreground
              "
              >
                {searchTerm ? "No results" : "You\u2019re up to date"}
              </h3>
              {searchTerm ? (
                <div
                  className="
                    flex max-w-[16rem] flex-col items-center gap-0.5
                    text-sm/relaxed text-muted-foreground
                  "
                >
                  <span>Nothing matched</span>
                  <span
                    className="
                      max-w-full truncate rounded-sm border border-border
                      bg-muted px-1.5 py-0.5 font-mono text-xs
                      text-foreground/80
                    "
                  >
                    {searchTerm}
                  </span>
                  <span>Try a different term.</span>
                </div>
              ) : (
                <p
                  className="
                    max-w-[16rem] text-sm/relaxed text-muted-foreground
                  "
                >
                  Check back later or pull for fresh articles.
                </p>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div key="feed-list" ref={handleViewportHostRef}>
          {scrollViewport ? (
            <>
              {pinnedTopCollapsingArticle ? (
                <div
                  className="
                  relative mx-auto w-full max-w-3xl px-1
                  lg:max-w-none lg:px-3
                "
                >
                  {renderArticleCard(
                    pinnedTopCollapsingArticle.article,
                    `${getArticleKey(pinnedTopCollapsingArticle.article)}::pinned-collapse`,
                    pinnedTopCollapsingArticle.height ?? undefined,
                  )}
                </div>
              ) : null}
              {virtualizedFeed.length > 0 ? (
                <Virtuoso
                  components={{ List: FeedVirtuosoList }}
                  computeItemKey={getVirtualizedArticleKey}
                  customScrollParent={scrollViewport}
                  data={virtualizedFeed}
                  defaultItemHeight={VIRTUAL_FEED_ROW_ESTIMATE_PX}
                  increaseViewportBy={{
                    bottom: virtualFeedPreload,
                    top: Math.round(virtualFeedPreload / 2),
                  }}
                  initialItemCount={Math.min(pageSize, virtualizedFeed.length)}
                  itemSize={measureFeedListItemSize}
                  itemContent={renderVirtualizedArticleCard}
                  minOverscanItemCount={{ bottom: 4, top: 2 }}
                />
              ) : null}
            </>
          ) : (
            <div
              className="
                relative mx-auto grid w-full max-w-3xl grid-cols-1 px-1
                lg:max-w-none lg:px-3
              "
            >
              {renderedFeed.map((article) =>
                renderArticleCard(article, getArticleKey(article)),
              )}
            </div>
          )}
        </div>
      )}
    </>
  );
});
