"use client";

/**
 * Renders the dashboard article feed inside the shared Radix ScrollArea.
 *
 * The feed now delegates viewport virtualization and dynamic-height handling to
 * react-virtuoso instead of managing manual paging, sentinels, FLIP reflow,
 * and scroll bookkeeping in-house. Feed rows stay visually idle so expand,
 * collapse, read, and filter updates resolve through plain layout changes.
 */

import { CheckCheck, SearchX, Sparkles } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useTheme } from "next-themes";
import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { Virtuoso } from "react-virtuoso";

import { type Article } from "@/lib";
import { useIsMobile } from "@/lib/hooks/useIsMobile";

import {
  type ArticleRemovalAnimationMode,
  type CollapsingArticles,
  getArticleRemovalAnimationDuration,
} from "../../hooks/useArticleActions";
import { getArticleKey } from "../../services/article-collection";
import { type ArticleFilter } from "../../services/article-filters";
import { ArticleCard } from "../ArticleCard";
import { FEED_ROW_COLLAPSE_FLOOR_PX, FEED_ROW_GAP_PX } from "./constants";
import { FeedListSkeleton } from "./FeedListSkeleton";

type FeedArticleCardProps = React.ComponentProps<typeof ArticleCard>;

interface FeedArticleRowProps extends Omit<FeedArticleCardProps, "showFavicon"> {
  showFavicons: boolean;
}

/** Inputs required to render and control the dashboard article list. */
interface FeedListProps {
  articleFilter: ArticleFilter;
  collapsingArticles?: Readonly<CollapsingArticles>;
  expandedArticleKey: null | string;
  feedViewKey: string;
  filteredFeed: Article[];
  hydratedArticleLinks: Record<string, boolean>;
  hydratingArticleLinks: Record<string, boolean>;
  isCollapseScrollRestoreActive?: boolean;
  isInitialLoading: boolean;
  isRefreshing: boolean;
  onExpandedSwipeRead: (article: Article) => void;
  onPrepareExpand?: (article: Article) => void;
  onSwipeRead?: (article: Article) => void;
  onToggle: (article: Article) => void;
  onToggleRead: (article: Article) => void;
  onToggleStarred: (article: Article) => void;
  searchTerm: string;
  showFavicons: boolean;
  updatingArticleState: Record<string, boolean>;
}

interface FeedListRowProps {
  articleKey: string;
  children: React.ReactNode;
  removalAnimationMode: ArticleRemovalAnimationMode | null;
}

type FeedRowReleasePhase = "collapsing" | "fading" | "idle";
type FeedViewportResolutionState = "missing" | "pending" | "ready";

const FEED_LOAD_MORE_THRESHOLD_PX = 504;
const FEED_PAGE_SIZE = 12;
const FEED_ROW_COLLAPSE_OFFSET_PX = FEED_ROW_COLLAPSE_FLOOR_PX;

/**
 * Compares per-row render inputs so unrelated feed state updates do not fan out
 * through every visible article card.
 */
function areFeedArticleRowPropsEqual(
  previousProps: FeedArticleRowProps,
  nextProps: FeedArticleRowProps,
) {
  return (
    previousProps.article === nextProps.article &&
    previousProps.articleKey === nextProps.articleKey &&
    previousProps.hasScrapedContent === nextProps.hasScrapedContent &&
    previousProps.isDark === nextProps.isDark &&
    previousProps.isExpanded === nextProps.isExpanded &&
    previousProps.isHydrating === nextProps.isHydrating &&
    previousProps.isMobile === nextProps.isMobile &&
    previousProps.isUpdatingState === nextProps.isUpdatingState &&
    previousProps.onExpandedSwipeRead === nextProps.onExpandedSwipeRead &&
    previousProps.onPrepareExpand === nextProps.onPrepareExpand &&
    previousProps.onSwipeRead === nextProps.onSwipeRead &&
    previousProps.onToggle === nextProps.onToggle &&
    previousProps.onToggleRead === nextProps.onToggleRead &&
    previousProps.onToggleStarred === nextProps.onToggleStarred &&
    previousProps.removalAnimationMode === nextProps.removalAnimationMode &&
    previousProps.showFavicons === nextProps.showFavicons &&
    previousProps.useRichFormatting === nextProps.useRichFormatting
  );
}

/**
 * Animates feed-row removal via a two-phase CSS-transition approach.
 *
 * Height measurement lives in a ref (not state) and the ResizeObserver is
 * disconnected while a collapse is in flight.  The commit phase applies "to"
 * styles via direct DOM mutation so no React reconciliation pass runs during
 * the transition — eliminating the per-frame ResizeObserver → setState loop
 * that previously dropped the animation to ~40 FPS.
 */
const FeedListRow = memo(function FeedListRow({
  articleKey,
  children,
  removalAnimationMode,
}: FeedListRowProps) {
  const outerRef = useRef<HTMLDivElement | null>(null);
  const innerRef = useRef<HTMLDivElement | null>(null);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const measuredHeightRef = useRef(0);
  const collapseCommittedRef = useRef(false);

  const isCollapsing = removalAnimationMode !== null;
  const isSwipeReadExit = removalAnimationMode === "swipe-read";
  const durationMs = removalAnimationMode
    ? getArticleRemovalAnimationDuration(removalAnimationMode)
    : 0;
  const transitionMs = Math.max(durationMs, 180);

  // Measure height continuously when idle; freeze during collapse so the
  // ResizeObserver doesn't fire on every CSS-transition frame.
  useEffect(() => {
    const node = bodyRef.current;
    if (!node) {
      return;
    }

    measuredHeightRef.current = node.scrollHeight;

    if (isCollapsing) {
      return;
    }

    const resizeObserver = new ResizeObserver(() => {
      measuredHeightRef.current = node.scrollHeight;
    });
    resizeObserver.observe(node);

    return () => {
      resizeObserver.disconnect();
    };
  }, [children, isCollapsing]);

  // Drive the two-phase collapse entirely through refs + DOM mutation so no
  // React re-render is needed between the "from" and "to" keyframes.
  useLayoutEffect(() => {
    if (!isCollapsing) {
      collapseCommittedRef.current = false;
      const outer = outerRef.current;
      const inner = innerRef.current;
      if (outer) {
        outer.style.willChange = "";
      }
      if (inner) {
        inner.style.willChange = "";
      }
      return;
    }

    collapseCommittedRef.current = false;

    // Promote animating elements to their own compositor layers.
    if (outerRef.current) {
      outerRef.current.style.willChange = "margin-bottom, opacity";
    }
    if (innerRef.current) {
      innerRef.current.style.willChange = "max-height, transform";
    }

    const collapseFrameId = requestAnimationFrame(() => {
      collapseCommittedRef.current = true;

      const outer = outerRef.current;
      const inner = innerRef.current;

      // Apply "to" styles directly — the CSS transition property (set via the
      // style prop in JSX) interpolates from the current rendered value to
      // these targets without a React reconciliation pass.
      if (outer) {
        outer.style.marginBottom = `${-FEED_ROW_COLLAPSE_OFFSET_PX}px`;
        if (!isSwipeReadExit) {
          outer.style.opacity = "0";
        }
      }
      if (inner) {
        inner.style.maxHeight = `${FEED_ROW_COLLAPSE_FLOOR_PX}px`;
        inner.style.minHeight = `${FEED_ROW_COLLAPSE_FLOOR_PX}px`;
        if (isSwipeReadExit) {
          inner.style.transform = "translate3d(2.5rem, 0, 0)";
        }
      }
    });

    return () => {
      cancelAnimationFrame(collapseFrameId);
    };
  }, [isCollapsing, isSwipeReadExit]);

  // Read refs so any React re-render during the animation produces styles
  // consistent with whatever the rAF callback already wrote to the DOM.
  const isCommitted = collapseCommittedRef.current;
  const measuredHeight = measuredHeightRef.current;
  const releasePhase: FeedRowReleasePhase = isCollapsing ? "collapsing" : "idle";
  const isReleaseCollapsing = isCollapsing && isCommitted;
  const rowOpacity =
    isSwipeReadExit
      ? 1
      : isReleaseCollapsing
        ? 0
        : 1;

  return (
    <div
      className="overflow-visible"
      data-feed-row-animation={removalAnimationMode ?? "idle"}
      data-feed-row-layout={isCollapsing ? "releasing" : "none"}
      data-feed-row-state={releasePhase}
      data-scroll-restore-key={articleKey}
      ref={outerRef}
      style={{
        contain: isCollapsing ? undefined : "layout style",
        marginBottom: isReleaseCollapsing
          ? -FEED_ROW_COLLAPSE_OFFSET_PX
          : FEED_ROW_GAP_PX,
        opacity: rowOpacity,
        transition: isCollapsing
          ? `margin-bottom ${transitionMs}ms cubic-bezier(0.25, 1, 0.5, 1), opacity ${Math.round(transitionMs * 0.65)}ms ease-out ${Math.round(transitionMs * 0.1)}ms`
          : "none",
      }}
    >
      <div
        className="min-w-0"
        ref={innerRef}
        style={{
          maxHeight: isCollapsing
            ? Math.max(
                isReleaseCollapsing
                  ? FEED_ROW_COLLAPSE_FLOOR_PX
                  : measuredHeight,
                FEED_ROW_COLLAPSE_FLOOR_PX,
              )
            : undefined,
          minHeight: isReleaseCollapsing
            ? FEED_ROW_COLLAPSE_FLOOR_PX
            : undefined,
          overflow: isCollapsing ? "hidden" : "visible",
          pointerEvents: isCollapsing ? "none" : "auto",
          transform:
            isSwipeReadExit
              ? isCollapsing
                ? "translate3d(2.5rem, 0, 0)"
                : "translate3d(0, 0, 0)"
              : "translate3d(0, 0, 0)",
          transition: isCollapsing
            ? `max-height ${transitionMs}ms cubic-bezier(0.25, 1, 0.5, 1), transform ${transitionMs}ms cubic-bezier(0.25, 1, 0.5, 1)`
            : `transform ${transitionMs}ms cubic-bezier(0.25, 1, 0.5, 1)`,
        }}
      >
        <div className="min-h-0" ref={bodyRef}>
          {children}
        </div>
      </div>
    </div>
  );
});

/**
 * Wraps a single article card so row-local flags can update without
 * reconstructing every visible feed row.
 */
const FeedArticleRow = memo(function FeedArticleRow({
  article,
  articleKey,
  hasScrapedContent,
  isDark,
  isExpanded,
  isHydrating,
  isMobile,
  isUpdatingState,
  onExpandedSwipeRead,
  onPrepareExpand,
  onSwipeRead,
  onToggle,
  onToggleRead,
  onToggleStarred,
  removalAnimationMode = null,
  showFavicons,
  useRichFormatting,
}: FeedArticleRowProps) {
  return (
    <FeedListRow
      articleKey={articleKey}
      removalAnimationMode={removalAnimationMode}
    >
      <ArticleCard
        article={article}
        articleKey={articleKey}
        hasScrapedContent={hasScrapedContent}
        isDark={isDark}
        isExpanded={isExpanded}
        isHydrating={isHydrating}
        isMobile={isMobile}
        isUpdatingState={isUpdatingState}
        onExpandedSwipeRead={onExpandedSwipeRead}
        onPrepareExpand={onPrepareExpand}
        onSwipeRead={onSwipeRead}
        onToggle={onToggle}
        onToggleRead={onToggleRead}
        onToggleStarred={onToggleStarred}
        removalAnimationMode={removalAnimationMode}
        showFavicon={showFavicons}
        useRichFormatting={useRichFormatting}
      />
    </FeedListRow>
  );
}, areFeedArticleRowPropsEqual);

/**
 * Self-contained empty state surface shown when no articles match filters.
 *
 * Extracted as a separate component so the AnimatePresence keyed transition
 * in FeedList can animate the empty state in independently.
 */
function FeedEmptyState({
  articleFilter,
  hasSearchTerm,
  trimmedSearchTerm,
}: {
  articleFilter: ArticleFilter;
  hasSearchTerm: boolean;
  trimmedSearchTerm: string;
}) {
  const EmptyStateIcon = hasSearchTerm
    ? SearchX
    : articleFilter === "starred"
      ? Sparkles
      : CheckCheck;

  return (
    <div
      className="
        relative isolate flex min-h-72 w-full max-w-2xl flex-col items-center
        justify-center px-6 py-10 text-center
        sm:min-h-80 sm:px-8 sm:py-12
      "
      data-feed-empty-state="true"
    >
      <div
        aria-hidden="true"
        className="
          absolute inset-x-10 top-0 h-24 rounded-full bg-primary/10 blur-3xl
        "
      />
      <div
        aria-hidden="true"
        className="
          absolute inset-x-20 bottom-0 h-20 rounded-full bg-foreground/5
          blur-3xl
        "
      />
      <div
        className="
          relative mb-5 inline-flex size-12 items-center justify-center
          rounded-full border border-border/70 bg-background/80
          text-muted-foreground/75
        "
      >
        <EmptyStateIcon className="size-4" />
      </div>
      <div className="relative space-y-2">
        <h3 className="text-xl font-semibold tracking-tight text-foreground">
          {hasSearchTerm ? "No results" : "You're up to date"}
        </h3>
        {hasSearchTerm ? (
          <div
            className="
              flex max-w-[16rem] flex-col items-center gap-0.5 text-sm/relaxed
              text-muted-foreground
            "
          >
            <span>Nothing matched</span>
            <span
              className="
                max-w-full truncate rounded-sm border border-border bg-muted
                px-1.5 py-0.5 font-mono text-xs text-foreground/80
              "
            >
              {trimmedSearchTerm}
            </span>
            <span>Try a different term.</span>
          </div>
        ) : (
          <p className="max-w-[16rem] text-sm/relaxed text-muted-foreground">
            Check back later or pull for fresh articles.
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * Renders the dashboard article feed as a virtualized list inside the Radix
 * viewport when available, with a plain-list fallback during the first mount.
 */
export const FeedList = memo(function FeedList({
  articleFilter,
  collapsingArticles = {},
  expandedArticleKey,
  feedViewKey,
  filteredFeed,
  hydratedArticleLinks,
  hydratingArticleLinks,
  isCollapseScrollRestoreActive = false,
  isInitialLoading,
  isRefreshing: _isRefreshing,
  onExpandedSwipeRead,
  onPrepareExpand,
  onSwipeRead,
  onToggle,
  onToggleRead,
  onToggleStarred,
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
  const [visibleArticleCount, setVisibleArticleCount] = useState(FEED_PAGE_SIZE);
  const [viewportResolutionState, setViewportResolutionState] =
    useState<FeedViewportResolutionState>("pending");
  const [isVirtualizationResumeDeferred, setIsVirtualizationResumeDeferred] =
    useState(false);
  const hasUserScrolledRef = useRef(false);
  const loadMoreSentinelRef = useRef<HTMLDivElement | null>(null);
  const viewportHostRef = useRef<HTMLDivElement | null>(null);
  const previousExpandedArticleKeyRef = useRef<null | string>(
    expandedArticleKey,
  );
  const handleViewportHostRef = useCallback((node: HTMLDivElement | null) => {
    viewportHostRef.current = node;
    queueMicrotask(() => {
      const resolvedViewport =
        node?.closest<HTMLElement>("[data-radix-scroll-area-viewport]") ??
        null;
      setScrollViewport(resolvedViewport);
      setViewportResolutionState(resolvedViewport ? "ready" : "missing");
    });
  }, []);

  useEffect(() => {
    hasUserScrolledRef.current = false;
    setVisibleArticleCount(FEED_PAGE_SIZE);
    setIsVirtualizationResumeDeferred(false);
  }, [feedViewKey, searchTerm]);

  useLayoutEffect(() => {
    if (!scrollViewport) {
      return;
    }

    if (scrollViewport.scrollTop === 0) {
      return;
    }

    scrollViewport.scrollTop = 0;
  }, [feedViewKey, scrollViewport]);

  useEffect(() => {
    const previousExpandedArticleKey = previousExpandedArticleKeyRef.current;
    previousExpandedArticleKeyRef.current = expandedArticleKey;

    if (expandedArticleKey !== null) {
      setIsVirtualizationResumeDeferred(false);
      return;
    }

    if (previousExpandedArticleKey === null) {
      return;
    }

    setIsVirtualizationResumeDeferred(true);
  }, [expandedArticleKey]);

  const visibleFeed = filteredFeed.slice(0, visibleArticleCount);

  const expandVisibleWindow = useCallback(() => {
    setVisibleArticleCount((currentCount) => {
      if (currentCount >= filteredFeed.length) {
        return currentCount;
      }

      return Math.min(currentCount + FEED_PAGE_SIZE, filteredFeed.length);
    });
  }, [filteredFeed.length]);

  const maybeLoadNextPage = useCallback(() => {
    if (!scrollViewport || visibleArticleCount >= filteredFeed.length) {
      return;
    }

    const remainingDistance =
      scrollViewport.scrollHeight -
      (scrollViewport.scrollTop + scrollViewport.clientHeight);

    if (
      hasUserScrolledRef.current &&
      Number.isFinite(remainingDistance) &&
      remainingDistance <= FEED_LOAD_MORE_THRESHOLD_PX
    ) {
      expandVisibleWindow();
    }
  }, [expandVisibleWindow, filteredFeed.length, scrollViewport, visibleArticleCount]);

  useEffect(() => {
    if (
      !isVirtualizationResumeDeferred ||
      !scrollViewport ||
      isCollapseScrollRestoreActive
    ) {
      return;
    }

    const resumeVirtualization = () => {
      setIsVirtualizationResumeDeferred(false);
    };

    scrollViewport.addEventListener("scroll", resumeVirtualization, {
      passive: true,
    });
    scrollViewport.addEventListener("touchmove", resumeVirtualization, {
      passive: true,
    });
    scrollViewport.addEventListener("wheel", resumeVirtualization, {
      passive: true,
    });

    return () => {
      scrollViewport.removeEventListener("scroll", resumeVirtualization);
      scrollViewport.removeEventListener("touchmove", resumeVirtualization);
      scrollViewport.removeEventListener("wheel", resumeVirtualization);
    };
  }, [isCollapseScrollRestoreActive, isVirtualizationResumeDeferred, scrollViewport]);

  useEffect(() => {
    if (!scrollViewport) {
      return;
    }

    const handleScrollIntent = () => {
      hasUserScrolledRef.current = true;
      setIsVirtualizationResumeDeferred(false);
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
  }, [maybeLoadNextPage, scrollViewport]);

  useEffect(() => {
    if (
      !scrollViewport ||
      typeof IntersectionObserver !== "function" ||
      visibleArticleCount >= filteredFeed.length
    ) {
      return;
    }

    const sentinel = loadMoreSentinelRef.current;
    if (!sentinel) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0].isIntersecting) {
          return;
        }

        if (scrollViewport.scrollTop > 0) {
          hasUserScrolledRef.current = true;
        }

        maybeLoadNextPage();
      },
      {
        root: scrollViewport,
        rootMargin: `0px 0px ${FEED_LOAD_MORE_THRESHOLD_PX}px 0px`,
        threshold: 0,
      },
    );

    observer.observe(sentinel);

    return () => {
      observer.disconnect();
    };
  }, [filteredFeed.length, maybeLoadNextPage, scrollViewport, visibleArticleCount]);

  const trimmedSearchTerm = searchTerm.trim();
  const hasSearchTerm = trimmedSearchTerm.length > 0;

  const renderFeedRow = useCallback(
    (article: Article) => {
      const articleKey = getArticleKey(article);
      const removalAnimationMode = collapsingArticles[articleKey]?.mode ?? null;
      const isHydrating = hydratingArticleLinks[article.link] ?? false;
      const isUpdatingState = updatingArticleState[articleKey] ?? false;
      const useRichFormatting = hydratedArticleLinks[article.link] ?? false;

      return (
        <FeedArticleRow
          article={article}
          articleKey={articleKey}
          hasScrapedContent={Boolean(article.hasFullContent)}
          isDark={isDark}
          isExpanded={expandedArticleKey === articleKey}
          isHydrating={isHydrating}
          isMobile={isMobile}
          isUpdatingState={isUpdatingState}
          key={articleKey}
          onExpandedSwipeRead={onExpandedSwipeRead}
          onPrepareExpand={onPrepareExpand}
          onSwipeRead={onSwipeRead}
          onToggle={onToggle}
          onToggleRead={onToggleRead}
          onToggleStarred={onToggleStarred}
          removalAnimationMode={removalAnimationMode}
          showFavicons={showFavicons}
          useRichFormatting={useRichFormatting}
        />
      );
    },
    [
      collapsingArticles,
      expandedArticleKey,
      hydratedArticleLinks,
      hydratingArticleLinks,
      isDark,
      isMobile,
      onExpandedSwipeRead,
      onPrepareExpand,
      onSwipeRead,
      onToggle,
      onToggleRead,
      onToggleStarred,
      showFavicons,
      updatingArticleState,
    ],
  );

  const listClassName = "w-full min-w-0";
  const shouldShowViewportResolutionSkeleton =
    !isInitialLoading &&
    filteredFeed.length > 0 &&
    viewportResolutionState === "pending";
  const isExpandedCollapseHandoffPending =
    expandedArticleKey === null && previousExpandedArticleKeyRef.current !== null;
  const shouldUseVirtualizedFeed =
    !isInitialLoading &&
    scrollViewport !== null &&
    expandedArticleKey === null &&
    !isCollapseScrollRestoreActive &&
    !isVirtualizationResumeDeferred &&
    !isExpandedCollapseHandoffPending;

  const showEmptyState =
    !isInitialLoading && filteredFeed.length === 0;

  const feedSurfaceMode = isInitialLoading || shouldShowViewportResolutionSkeleton
    ? "skeleton"
    : showEmptyState
      ? "empty"
      : shouldUseVirtualizedFeed
        ? "virtualized"
        : "plain";

  const contentKey = isInitialLoading
    ? "feed-skeleton"
    : showEmptyState
      ? "feed-empty"
      : shouldShowViewportResolutionSkeleton
        ? "feed-viewport-skeleton"
        : shouldUseVirtualizedFeed
          ? "feed-virtualized"
          : "feed-plain";

  const skeletonExitTransition = {
    duration: 0.25,
    ease: [0.16, 1, 0.3, 1] as const,
  };
  const contentEnterTransition = {
    duration: 0.35,
    ease: [0.16, 1, 0.3, 1] as const,
  };

  return (
    <div
      className={listClassName}
      data-feed-surface-mode={feedSurfaceMode}
      ref={isInitialLoading || showEmptyState ? undefined : handleViewportHostRef}
    >
      <AnimatePresence mode="wait">
        {isInitialLoading || shouldShowViewportResolutionSkeleton ? (
          <motion.div
            animate={{ opacity: 1, scale: 1 }}
            exit={{ filter: "blur(4px)", opacity: 0, scale: 0.97 }}
            initial={{ opacity: 1, scale: 1 }}
            key={contentKey}
            transition={skeletonExitTransition}
          >
            <FeedListSkeleton />
          </motion.div>
        ) : showEmptyState ? (
          <motion.div
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="
              flex min-h-[clamp(20rem,calc(100dvh-12rem),34rem)] w-full
              items-center justify-center px-1 py-3
              sm:px-4 sm:py-6
            "
            data-feed-empty-state-frame="true"
            initial={{ opacity: 0, scale: 0.97, y: 8 }}
            key={contentKey}
            transition={contentEnterTransition}
          >
            <FeedEmptyState
              articleFilter={articleFilter}
              hasSearchTerm={hasSearchTerm}
              trimmedSearchTerm={trimmedSearchTerm}
            />
          </motion.div>
        ) : shouldUseVirtualizedFeed ? (
          <motion.div
            animate={{ opacity: 1, y: 0 }}
            className={listClassName}
            initial={{ opacity: 0, y: 6 }}
            key={contentKey}
            transition={contentEnterTransition}
          >
            <Virtuoso
              className={listClassName}
              components={{
                Footer: () =>
                  visibleArticleCount < filteredFeed.length ? (
                    <div
                      className="h-px w-full"
                      data-feed-load-more-sentinel="true"
                      ref={loadMoreSentinelRef}
                    />
                  ) : null,
              }}
              computeItemKey={(_index, article) => getArticleKey(article)}
              customScrollParent={scrollViewport}
              data={visibleFeed}
              data-feed-virtualizer="true"
              increaseViewportBy={200}
              initialItemCount={Math.min(visibleFeed.length, 8)}
              itemContent={(_index, article) => renderFeedRow(article)}
              key={feedViewKey}
              overscan={200}
            />
          </motion.div>
        ) : (
          <motion.div
            animate={{ opacity: 1, y: 0 }}
            className={listClassName}
            initial={{ opacity: 0, y: 6 }}
            key={contentKey}
            transition={contentEnterTransition}
          >
            {visibleFeed.map(renderFeedRow)}
            {visibleArticleCount < filteredFeed.length ? (
              <div
                className="h-px w-full"
                data-feed-load-more-sentinel="true"
                ref={loadMoreSentinelRef}
              />
            ) : null}
          </motion.div>
      )}
      </AnimatePresence>
    </div>
  );
});
