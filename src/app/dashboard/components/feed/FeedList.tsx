"use client";

/**
 * Coordinates the dashboard's article feed rendering pipeline.
 *
 * This module deliberately keeps paging, virtualization, retained collapsing
 * rows, and empty-state presentation in one place because those concerns all
 * share ownership of the same scroll surface. The implementation is therefore
 * more stateful than a typical list component: each decision about when to
 * virtualize or retain a row directly affects exit-animation correctness,
 * scroll anchoring, and whether an expanded card can collapse without a visual
 * flash.
 */

import { useVirtualizer } from "@tanstack/react-virtual";
import { SearchX, Sparkles } from "lucide-react";
import { motion } from "motion/react";
import { useTheme } from "next-themes";
import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { type Article } from "@/lib";
import { useIsMobile } from "@/lib/hooks/useIsMobile";

import {
  ARTICLE_COLLAPSE_HEIGHT_ANIMATION_MS,
  ARTICLE_DEEXPAND_REMOVAL_ANIMATION_MS,
  ARTICLE_REMOVAL_ANIMATION_MS,
  type ArticleRemovalAnimationMode,
  type CollapsingArticles,
  type CollapsingArticleState,
} from "../../hooks/useArticleActions";
import { getArticleKey } from "../../services/article-collection";
import { ArticleCard } from "../ArticleCard";
import { DashboardFeedListSkeleton } from "../DashboardLoadingSurfaces";
import {
  FEED_LOAD_MORE_THRESHOLD_PX,
  FEED_ROW_COLLAPSE_FLOOR_PX,
  FEED_ROW_COLLAPSE_OFFSET_PX,
  FEED_ROW_EXIT_EASING,
  FEED_ROW_GAP_PX,
  FEED_ROW_OPACITY_EASING,
  FEED_ROW_REFLOW_ANIMATION_MS,
  FEED_ROW_SWIPE_EXIT_DISTANCE,
  FEED_ROW_SWIPE_EXIT_EASING,
  FEED_ROW_VIRTUAL_OVERSCAN,
  VIRTUAL_FEED_ROW_ESTIMATE_PX,
} from "./constants";

/**
 * Inputs required to render and control the dashboard article list.
 *
 * The parent controller owns all feed mutations, expansion state, and
 * hydration bookkeeping. FeedList consumes that state and turns it into the
 * correct visual surface, including virtualization, retained collapsing rows,
 * and load-more behavior.
 */
interface FeedListProps {
  /**
   * Article key that is still in its post-collapse settling window.
   * Virtualization stays suspended while this is set so the DOM surface does
   * not switch underneath a finishing animation.
   */
  collapseSettlingArticleKey?: null | string;
  /**
   * Active unread-removal states keyed by article key.
   * Each entry carries the row snapshot needed to keep the item rendered until
   * its exit choreography completes.
   */
  collapsingArticles?: Readonly<CollapsingArticles>;
  /** Currently expanded article, or null when the feed is in list mode. */
  expandedArticleKey: null | string;
  /** Already-filtered article collection for the current dashboard selection. */
  filteredFeed: Article[];
  /** Link-level hydration completion state for rich article content. */
  hydratedArticleLinks: Record<string, boolean>;
  /** Link-level hydration in-flight state used to show loading affordances. */
  hydratingArticleLinks: Record<string, boolean>;
  /** Whether the initial dashboard feed payload is still loading. */
  isInitialLoading: boolean;
  /** Refresh flag owned by the parent; preserved for API symmetry. */
  isRefreshing: boolean;
  /** Swipe-to-read handler for the expanded article surface. */
  onExpandedSwipeRead: (article: Article) => void;
  /** Optional pre-expansion hook for loading or measurement preparation. */
  onPrepareExpand?: (article: Article) => void;
  /** Swipe-to-read handler for collapsed row surfaces. */
  onSwipeRead?: (article: Article) => void;
  /** Expand or collapse a specific article card. */
  onToggle: (article: Article) => void;
  /** Toggle article read state from any rendered feed row. */
  onToggleRead: (article: Article) => void;
  /** Toggle article starred state from any rendered feed row. */
  onToggleStarred: (article: Article) => void;
  /** Number of articles revealed per paging step. */
  pageSize: number;
  /** External reset token used when the feed selection changes. */
  paginationResetKey: string;
  /** Search term used to select the empty-state copy and iconography. */
  searchTerm: string;
  /** Whether favicon chrome should render within article cards. */
  showFavicons: boolean;
  /** Per-article mutation state for read/star toggles and similar actions. */
  updatingArticleState: Record<string, boolean>;
}

/**
 * Props for the retained row wrapper that owns measurement and exit layout.
 *
 * The wrapper exists so the article card can stay focused on article UI while
 * the list surface controls how rows are measured, animated, and reflowed.
 */
interface FeedListRowProps {
  /** Stable article identity used for restore attributes and retained height maps. */
  articleKey: string;
  /** Actual card content rendered inside the measured row shell. */
  children: React.ReactNode;
  /** Virtual row index written for TanStack Virtual diagnostics and measurement. */
  dataIndex?: number;
  /** Previously retained height reused before the row is measured again. */
  initialMeasuredHeight?: number;
  /** Called whenever the content height changes so the parent can cache it. */
  onMeasuredHeightChange?: (height: number) => void;
  /** Measurement callback forwarded to the virtualizer when virtualization is active. */
  onMeasureElement?: (element: HTMLDivElement | null) => void;
  /** Active removal choreography, or null when the row is stable. */
  removalAnimationMode: ArticleRemovalAnimationMode | null;
  /** Whether siblings should animate positional reflow around this row. */
  shouldAnimateReflow: boolean;
}

/**
 * Snapshot of scroll-surface state used to decide whether another page should
 * be revealed.
 */
interface FeedLoadMoreState {
  /** Current viewport height in pixels. */
  clientHeight: number;
  /** Guard that prevents auto-expanding before the user interacts with the feed. */
  hasUserScrolled: boolean;
  /** Total scrollable content height in pixels. */
  scrollHeight: number;
  /** Current scroll offset from the top of the feed surface. */
  scrollTop: number;
  /** Number of articles available in the filtered collection. */
  totalArticleCount: number;
  /** Number of articles currently rendered or eligible for rendering. */
  visibleArticleCount: number;
}

/**
 * Retained metadata for a row that is leaving the visible feed but still needs
 * to exist long enough to animate out.
 */
interface RetainedCollapsingArticle {
  /** Full article payload used to keep rendering the row during exit. */
  article: Article;
  /** Last known row height, if one was recorded before removal started. */
  height: null | number;
  /** Original feed index used to splice the retained row back into view order. */
  index: number;
  /** Exit choreography chosen by the article-action layer. */
  mode: ArticleRemovalAnimationMode;
  /** Whether the row still exists in the visible slice or comes from a snapshot. */
  source: "snapshot" | "visible";
}

/**
 * Keeps the virtualizer from recording impossible zero-height rows during list
 * churn, which otherwise causes poor scroll anchoring and console errors.
 */
export function measureFeedListItemSize(element: Element): number {
  return Math.max(
    element.getBoundingClientRect().height,
    FEED_ROW_COLLAPSE_FLOOR_PX,
  );
}

/**
 * Preserves a row long enough for unread removals to animate out without
 * tearing the virtualization state or skipping the exit.
 *
 * The row shell owns three closely-related concerns:
 * 1. Measure the card content and report stable heights upward.
 * 2. Freeze that height once removal starts so collapse math is deterministic.
 * 3. Apply the correct exit strategy for button collapse, swipe-read, and
 *    de-expanding removal flows.
 */
const FeedListRow = memo(function FeedListRow({
  articleKey,
  children,
  dataIndex,
  initialMeasuredHeight,
  onMeasuredHeightChange,
  onMeasureElement,
  removalAnimationMode,
  shouldAnimateReflow,
}: FeedListRowProps) {
  const contentRef = useRef<HTMLDivElement | null>(null);
  const removalActivationTimeoutRef = useRef<null | number>(null);
  const isRemoving = removalAnimationMode !== null;
  const isDeExpandingHold = removalAnimationMode === "de-expanding";
  const isSwipeReadExit = removalAnimationMode === "swipe-read";
  const isStandardCollapseExit =
    isRemoving && !isDeExpandingHold && !isSwipeReadExit;
  // Keep the most trustworthy non-zero height we have seen so a removal can
  // still animate cleanly even if the row is unmounted or remeasured mid-churn.
  const stableHeightRef = useRef(
    Math.max(initialMeasuredHeight ?? 0, FEED_ROW_COLLAPSE_FLOOR_PX),
  );
  const [measuredHeight, setMeasuredHeight] = useState<null | number>(
    initialMeasuredHeight ?? null,
  );
  const [removalHeight, setRemovalHeight] = useState<null | number>(
    isRemoving ? (initialMeasuredHeight ?? null) : null,
  );
  const [isRemovalTransitionActive, setIsRemovalTransitionActive] =
    useState(false);

  const setRowElement = useCallback(
    (node: HTMLDivElement | null) => {
      onMeasureElement?.(node);
    },
    [onMeasureElement],
  );

  useLayoutEffect(() => {
    const node = contentRef.current;
    if (!node) return;

    // Measure in layout so the parent height cache and the virtualizer see the
    // committed DOM size before the browser paints the next frame.
    const updateMeasuredHeight = () => {
      const nextHeight = Math.max(
        node.offsetHeight,
        FEED_ROW_COLLAPSE_FLOOR_PX,
      );
      stableHeightRef.current = nextHeight;
      setMeasuredHeight(nextHeight);
      onMeasuredHeightChange?.(nextHeight);
    };

    updateMeasuredHeight();

    if (typeof ResizeObserver !== "function") {
      return;
    }

    const observer = new ResizeObserver(() => {
      updateMeasuredHeight();
    });
    observer.observe(node);
    return () => {
      observer.disconnect();
    };
  }, [children, onMeasuredHeightChange]);

  useLayoutEffect(() => {
    if (!isRemoving) {
      if (removalActivationTimeoutRef.current !== null) {
        window.clearTimeout(removalActivationTimeoutRef.current);
        removalActivationTimeoutRef.current = null;
      }
      setIsRemovalTransitionActive(false);
      setRemovalHeight(null);
      return;
    }

    // Capture the row height exactly when removal begins. Exit animation math
    // should not depend on later content changes while the row is collapsing.
    const nextRemovalHeight =
      contentRef.current?.offsetHeight ??
      measuredHeight ??
      stableHeightRef.current;

    setRemovalHeight(Math.max(nextRemovalHeight, FEED_ROW_COLLAPSE_FLOOR_PX));
    setIsRemovalTransitionActive(true);

    return () => {
      if (removalActivationTimeoutRef.current !== null) {
        window.clearTimeout(removalActivationTimeoutRef.current);
        removalActivationTimeoutRef.current = null;
      }
    };
  }, [isRemoving, measuredHeight]);

  const resolvedRemovalHeight = Math.max(
    removalHeight ?? measuredHeight ?? stableHeightRef.current,
    FEED_ROW_COLLAPSE_FLOOR_PX,
  );
  const hasResolvedRemovalHeight =
    removalHeight !== null || measuredHeight !== null;
  const shouldAnimateRemoval = isRemoving && hasResolvedRemovalHeight;
  // Standard read-toggle collapse immediately snaps the layout footprint to the
  // floor height and lets opacity finish the perceived exit. Swipe-read and
  // de-expanding removals keep more of the original height contract for longer.
  const resolvedHeight = isRemoving
    ? isStandardCollapseExit
      ? FEED_ROW_COLLAPSE_FLOOR_PX
      : isRemovalTransitionActive
      ? FEED_ROW_COLLAPSE_FLOOR_PX
      : resolvedRemovalHeight
    : undefined;
  const resolvedMarginBottom = isRemoving
    ? isStandardCollapseExit
      ? -FEED_ROW_COLLAPSE_FLOOR_PX
      : isRemovalTransitionActive
        ? -FEED_ROW_COLLAPSE_OFFSET_PX
        : FEED_ROW_GAP_PX
    : FEED_ROW_GAP_PX;
  const resolvedOpacity = isRemoving && isRemovalTransitionActive ? 0 : 1;
  const resolvedStyleOpacity = isStandardCollapseExit
    ? 0
    : shouldAnimateRemoval
      ? 1
      : undefined;
  const resolvedTransform = isDeExpandingHold
    ? undefined
    : isRemoving
      ? isRemovalTransitionActive
        ? isSwipeReadExit
          ? `translate3d(${FEED_ROW_SWIPE_EXIT_DISTANCE}, 0, 0)`
          : "scale(0.985)"
        : "translate3d(0px, 0px, 0px) scale(1)"
      : undefined;

  /**
   * Motion transition map for the current row state.
   *
   * Standard collapse intentionally avoids Motion-driven height writes to dodge
   * a one-frame flash before the collapse lands. Swipe-read and de-expanding
   * exits keep full transition objects because they need staged transform and
   * height choreography.
   */
  const rowMotionTransition = useMemo(() => {
    if (isRemoving) {
      if (isDeExpandingHold) {
        const durationSeconds = ARTICLE_DEEXPAND_REMOVAL_ANIMATION_MS / 1000;
        return {
          height: { duration: durationSeconds, ease: FEED_ROW_EXIT_EASING },
          marginBottom: {
            duration: durationSeconds,
            ease: FEED_ROW_EXIT_EASING,
          },
          opacity: {
            duration: durationSeconds,
            ease: FEED_ROW_OPACITY_EASING,
          },
        };
      }

      const collapseDurationSeconds = ARTICLE_REMOVAL_ANIMATION_MS / 1000;
      const collapseDelaySeconds = 0;
      const swipeHeightDelaySeconds =
        Math.round(ARTICLE_REMOVAL_ANIMATION_MS * 0.44) / 1000;
      const opacityDurationSeconds =
        Math.round(ARTICLE_REMOVAL_ANIMATION_MS * 0.72) / 1000;

      if (isStandardCollapseExit) {
        const collapseHeightSeconds =
          ARTICLE_COLLAPSE_HEIGHT_ANIMATION_MS / 1000;
        return {
          height: {
            duration: collapseHeightSeconds,
            ease: FEED_ROW_EXIT_EASING,
          },
          marginBottom: {
            duration: collapseHeightSeconds,
            ease: FEED_ROW_EXIT_EASING,
          },
        };
      }

      return {
        height: {
          delay: isSwipeReadExit
            ? swipeHeightDelaySeconds
            : collapseDelaySeconds,
          duration: collapseDurationSeconds,
          ease: FEED_ROW_EXIT_EASING,
        },
        marginBottom: {
          delay: isSwipeReadExit
            ? swipeHeightDelaySeconds
            : collapseDelaySeconds,
          duration: collapseDurationSeconds,
          ease: FEED_ROW_EXIT_EASING,
        },
        opacity: {
          duration: opacityDurationSeconds,
          ease: FEED_ROW_OPACITY_EASING,
        },
      };
    }

    if (!shouldAnimateReflow) {
      return undefined;
    }

    return {
      layout: {
        duration: FEED_ROW_REFLOW_ANIMATION_MS / 1000,
        ease: FEED_ROW_EXIT_EASING,
      },
    };
  }, [
    isDeExpandingHold,
    isRemoving,
    isStandardCollapseExit,
    isSwipeReadExit,
    shouldAnimateReflow,
  ]);

  return (
    <motion.div
      animate={
        shouldAnimateRemoval
          ? isStandardCollapseExit
            ? {
                height: resolvedHeight,
                marginBottom: resolvedMarginBottom,
              }
            : {
                height: resolvedHeight,
                marginBottom: resolvedMarginBottom,
                opacity: resolvedOpacity,
              }
          : undefined
      }
      className="overflow-visible"
      data-feed-row-animation={removalAnimationMode ?? "idle"}
      data-feed-row-layout={shouldAnimateReflow ? "position" : "none"}
      data-feed-row-state={isRemoving ? "collapsing" : "idle"}
      data-index={dataIndex}
      data-scroll-restore-key={articleKey}
      initial={false}
      layout={shouldAnimateReflow ? "position" : false}
      ref={setRowElement}
      style={{
        height: shouldAnimateRemoval
          ? resolvedRemovalHeight
          : isStandardCollapseExit
            ? FEED_ROW_COLLAPSE_FLOOR_PX
            : undefined,
        marginBottom:
          isStandardCollapseExit && !shouldAnimateRemoval
            ? -FEED_ROW_COLLAPSE_FLOOR_PX
            : FEED_ROW_GAP_PX,
        minHeight:
          isStandardCollapseExit || (isRemoving && isRemovalTransitionActive)
            ? FEED_ROW_COLLAPSE_FLOOR_PX
            : undefined,
        opacity: resolvedStyleOpacity,
        overflow:
          isSwipeReadExit || isDeExpandingHold || isStandardCollapseExit
            ? "hidden"
            : "visible",
        pointerEvents: isRemoving ? "none" : undefined,
        transform: resolvedTransform,
        transformOrigin: isSwipeReadExit ? "center left" : "top center",
        transition:
          isRemoving && !isDeExpandingHold
            ? isSwipeReadExit
              ? `transform ${ARTICLE_REMOVAL_ANIMATION_MS}ms cubic-bezier(${FEED_ROW_SWIPE_EXIT_EASING.join(", ")})`
              : `transform ${ARTICLE_REMOVAL_ANIMATION_MS}ms cubic-bezier(${FEED_ROW_EXIT_EASING.join(", ")})`
            : undefined,
        willChange: isRemoving
          ? isDeExpandingHold
            ? "height, margin-bottom, opacity"
            : isStandardCollapseExit
              ? "height, margin-bottom"
              : "height, margin-bottom, opacity, transform"
          : undefined,
      }}
      transition={rowMotionTransition}
    >
      {/*
        Measure the natural card height from an inner wrapper so the outer
        motion shell can independently clamp and animate its own box metrics.
      */}
      <div ref={contentRef}>{children}</div>
    </motion.div>
  );
});

/** Options used to decide whether sibling rows should receive layout reflow. */
interface FeedRowReflowAnimationOptions {
  /** Keys of rows that are currently retained for active removal choreography. */
  activeCollapsingArticleKeys: ReadonlySet<string>;
  /** Whether any active removal mode requires sibling motion instead of a hard snap. */
  hasAnimatedRemoval: boolean;
}

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
 * Limits Motion position reflow to sibling rows that need to settle around an
 * active staged removal, preventing ordinary expand/collapse from animating the
 * rest of the feed.
 */
function shouldAnimateFeedRowReflow({
  activeCollapsingArticleKeys,
  hasAnimatedRemoval,
}: FeedRowReflowAnimationOptions) {
  /**
   * Only non-collapsing siblings opt into Motion's position reflow.
   * This keeps ordinary article expand/collapse from animating the entire feed
   * while still allowing nearby rows to settle around a retained exit row.
   */
  return ({
    articleKey,
    removalAnimationMode,
  }: {
    articleKey: string;
    removalAnimationMode: ArticleRemovalAnimationMode | null;
  }) =>
    hasAnimatedRemoval &&
    activeCollapsingArticleKeys.size > 0 &&
    !activeCollapsingArticleKeys.has(articleKey) &&
    removalAnimationMode === null;
}

  /**
   * Renders the dashboard's article feed.
   *
   * The component has three top-level modes:
   * 1. Initial loading skeleton.
   * 2. Empty state when the filtered feed has no rows.
   * 3. Feed list mode, which may be virtualized or rendered as a full grid.
   *
   * Virtualization is intentionally suspended during expanded-card mode and
   * animated removal flows because those states depend on DOM continuity more
   * than they depend on reducing mounted row count.
   */
export const FeedList = memo(function FeedList({
  collapseSettlingArticleKey = null,
  collapsingArticles = {},
  expandedArticleKey,
  filteredFeed,
  hydratedArticleLinks,
  hydratingArticleLinks,
  isInitialLoading,
  isRefreshing: _isRefreshing,
  onExpandedSwipeRead,
  onPrepareExpand,
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
  const collapseSettleTimeoutRef = useRef<null | number>(null);
  const hasUserScrolledRef = useRef(false);
  const loadMoreSentinelRef = useRef<HTMLDivElement | null>(null);
  const previousExpandedArticleKeyRef = useRef<null | string>(
    expandedArticleKey,
  );
  const [isVirtualizationResumeDeferred, setIsVirtualizationResumeDeferred] =
    useState(false);
  const viewportHostRef = useRef<HTMLDivElement | null>(null);
  const resolvedScrollViewportRef = useRef<HTMLElement | null>(null);
  const retainedVisibleArticleHeightsRef = useRef(new Map<string, number>());

  // Defensive cleanup for any pending post-collapse deferral when the list
  // unmounts or the owning dashboard surface changes.
  useEffect(
    () => () => {
      if (collapseSettleTimeoutRef.current !== null) {
        window.clearTimeout(collapseSettleTimeoutRef.current);
      }
    },
    [],
  );

  // When an expanded card closes, defer re-enabling virtualization for a beat
  // so the feed can settle on the same DOM surface before rows become virtual.
  useLayoutEffect(() => {
    const previousExpandedArticleKey = previousExpandedArticleKeyRef.current;
    previousExpandedArticleKeyRef.current = expandedArticleKey;

    if (expandedArticleKey !== null) {
      if (collapseSettleTimeoutRef.current !== null) {
        window.clearTimeout(collapseSettleTimeoutRef.current);
        collapseSettleTimeoutRef.current = null;
      }
      setIsVirtualizationResumeDeferred(false);
      return;
    }

    if (previousExpandedArticleKey === null) {
      return;
    }

    setIsVirtualizationResumeDeferred(true);
  }, [expandedArticleKey]);

  const activeCollapsingArticleEntries = useMemo(
    () =>
      Object.entries(collapsingArticles)
        .filter(
          (
            collapsingArticleEntry,
          ): collapsingArticleEntry is [string, CollapsingArticleState] => {
            return collapsingArticleEntry[1] !== undefined;
          },
        )
        .sort(([, leftState], [, rightState]) => {
          return leftState.index - rightState.index;
        }),
    [collapsingArticles],
  );
  // The set form is cheaper to probe inside per-row animation decisions than
  // repeatedly scanning the ordered tuple array.
  const activeCollapsingArticleKeys = useMemo(
    () => new Set(activeCollapsingArticleEntries.map(([articleKey]) => articleKey)),
    [activeCollapsingArticleEntries],
  );
  const visibleFeed = useMemo(
    () => filteredFeed.slice(0, visibleArticleCount),
    [filteredFeed, visibleArticleCount],
  );

  /**
   * Preserve rows that are actively animating out even after they disappear
   * from the current visible slice. This lets the feed keep rendering them at
   * their original index until the removal finishes.
   */
  const collapsingArticleSnapshots = useMemo<RetainedCollapsingArticle[]>(() => {
    const nextSnapshots: RetainedCollapsingArticle[] = [];

    for (const [articleKey, collapsingArticleState] of activeCollapsingArticleEntries) {

      const visibleArticleIndex = visibleFeed.findIndex(
        (article) => getArticleKey(article) === articleKey,
      );
      if (visibleArticleIndex >= 0) {
        nextSnapshots.push({
          article: visibleFeed[visibleArticleIndex],
          height: retainedVisibleArticleHeightsRef.current.get(articleKey) ?? null,
          index: visibleArticleIndex,
          mode: collapsingArticleState.mode,
          source: "visible",
        });
        continue;
      }

      nextSnapshots.push({
        article: collapsingArticleState.article,
        height: retainedVisibleArticleHeightsRef.current.get(articleKey) ?? null,
        index: collapsingArticleState.index,
        mode: collapsingArticleState.mode,
        source: "snapshot",
      });
    }

    return nextSnapshots;
  }, [activeCollapsingArticleEntries, visibleFeed]);

  // Merge retained snapshot rows back into the visible feed in index order so
  // sibling positioning and scroll anchoring match the pre-removal layout.
  const renderedFeed = useMemo(() => {
    if (collapsingArticleSnapshots.length === 0) {
      return visibleFeed;
    }

    const nextRenderedFeed = [...visibleFeed];

    let insertionOffset = 0;
    for (const collapsingArticleSnapshot of collapsingArticleSnapshots) {
      if (collapsingArticleSnapshot.source === "visible") {
        continue;
      }

      const nextInsertIndex = Math.min(
        collapsingArticleSnapshot.index + insertionOffset,
        nextRenderedFeed.length,
      );
      nextRenderedFeed.splice(
        nextInsertIndex,
        0,
        collapsingArticleSnapshot.article,
      );
      insertionOffset += 1;
    }

    return nextRenderedFeed;
  }, [collapsingArticleSnapshots, visibleFeed]);
  const hasAnimatedRemoval = activeCollapsingArticleEntries.some(
    ([, state]) => state.mode !== "collapse",
  );
  const shouldAnimateRowReflow = shouldAnimateFeedRowReflow({
    activeCollapsingArticleKeys,
    hasAnimatedRemoval,
  });
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

  const maybeLoadNextPage = useCallback(() => {
    if (!scrollViewport) {
      return;
    }

    // Paging is intentionally gated on real user scroll intent so simply
    // mounting into a short viewport does not immediately reveal the full list.
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
  }, [
    expandVisibleWindow,
    filteredFeed.length,
    scrollViewport,
    visibleArticleCount,
  ]);

  useEffect(() => {
    hasUserScrolledRef.current = false;
    setVisibleArticleCount(pageSize);
  }, [pageSize, paginationResetKey]);

  // Any touch, wheel, or actual scroll movement marks the feed as user-driven,
  // which unlocks incremental paging and cancels virtualization deferral.
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
        const [entry] = entries;
        if (!entry.isIntersecting) {
          return;
        }

        if (scrollViewport.scrollTop > 0) {
          hasUserScrolledRef.current = true;
        }

        maybeLoadNextPage();
      },
      {
        // Extend the root margin downward so the next page starts loading a
        // little before the user fully reaches the end of the current window.
        root: scrollViewport,
        rootMargin: `0px 0px ${FEED_LOAD_MORE_THRESHOLD_PX}px 0px`,
        threshold: 0,
      },
    );

    observer.observe(sentinel);
    return () => {
      observer.disconnect();
    };
  }, [
    filteredFeed.length,
    maybeLoadNextPage,
    scrollViewport,
    visibleArticleCount,
  ]);

  /**
   * Resolves the surrounding Radix viewport in a microtask so virtualization
   * can reuse the dashboard scroller without issuing a lifecycle-phase update.
   */
  const syncResolvedScrollViewport = useCallback(() => {
    const nextViewport =
      viewportHostRef.current?.closest<HTMLElement>(
        "[data-radix-scroll-area-viewport]",
      ) ?? null;

    if (resolvedScrollViewportRef.current === nextViewport) {
      return;
    }

    resolvedScrollViewportRef.current = nextViewport;
    setScrollViewport(nextViewport);
  }, []);

  const handleViewportHostRef = useCallback(
    (node: HTMLDivElement | null) => {
      viewportHostRef.current = node;
      queueMicrotask(syncResolvedScrollViewport);
    },
    [syncResolvedScrollViewport],
  );

  /**
   * Expanded cards keep dynamic measured height, sticky chrome, and hydrated
   * content mounted. Suspending virtualization during animated collapse exits
   * (swipe-read, de-expanding) avoids remount and re-measure churn while the
   * feed is animating.  Standard button-click collapses keep the virtualizer
   * active to avoid a DOM restructuring flash when switching between the
   * virtualizer and grid containers.
   */
  const shouldVirtualizeFeed =
    scrollViewport !== null &&
    expandedArticleKey === null &&
    !hasAnimatedRemoval &&
    collapseSettlingArticleKey === null &&
    !isVirtualizationResumeDeferred;

  // TanStack Virtual callbacks may run outside React render timing, so keep a
  // ref to the latest rendered feed instead of closing over a stale array.
  const renderedFeedRef = useRef(renderedFeed);
  renderedFeedRef.current = renderedFeed;

  /**
   * Estimate a row size for unmeasured items.
   *
   * Previously measured heights win because they dramatically improve scroll
   * anchoring when rows are revisited after virtualization or collapse churn.
   */
  const estimateItemSize = useCallback(
    (index: number) => {
      const article = renderedFeedRef.current[index];
      const retained = retainedVisibleArticleHeightsRef.current.get(
        getArticleKey(article),
      );
      return retained ?? VIRTUAL_FEED_ROW_ESTIMATE_PX;
    },
    [],
  );

  // The virtualizer is effectively paused by setting count to zero and
  // returning null for the scroll element. That preserves the instance while
  // cleanly dropping back to the fully rendered grid surface.
  const feedVirtualizer = useVirtualizer({
    count: shouldVirtualizeFeed ? renderedFeed.length : 0,
    estimateSize: estimateItemSize,
    getItemKey: (index) =>
      renderedFeed[index]
        ? getArticleKey(renderedFeed[index])
        : `feed-missing-row-${index}`,
    getScrollElement: () => (shouldVirtualizeFeed ? scrollViewport : null),
    measureElement: (element) => measureFeedListItemSize(element),
    overscan: FEED_ROW_VIRTUAL_OVERSCAN,
  });
  const virtualFeedItems = shouldVirtualizeFeed
    ? feedVirtualizer.getVirtualItems()
    : [];
  // Before TanStack Virtual has enough measurements to compute a window, render
  // a small deterministic prefix so the user still sees content immediately.
  const fallbackVirtualFeedItems = useMemo(
    () => renderedFeed.slice(0, Math.min(pageSize, renderedFeed.length)),
    [pageSize, renderedFeed],
  );
  const hasMeasuredVirtualViewport = virtualFeedItems.length > 0;
  const virtualFeedTopPadding = virtualFeedItems[0]?.start ?? 0;
  const virtualFeedBottomPadding = Math.max(
    feedVirtualizer.getTotalSize() -
      (virtualFeedItems[virtualFeedItems.length - 1]?.end ?? 0),
    0,
  );

  useEffect(() => {
    if (shouldVirtualizeFeed) {
      feedVirtualizer.measure();
    }
  }, [feedVirtualizer, renderedFeed, shouldVirtualizeFeed]);

  /**
   * Renders a single article row while preserving the scroll-restore key and
   * removal-mode animation contract.
   */
  const renderArticleCard = useCallback(
    (
      article: Article,
      options?: {
        dataIndex?: number;
        initialMeasuredHeight?: number;
        key?: string;
        onMeasureElement?: (element: HTMLDivElement | null) => void;
      },
    ) => {
      const articleKey = getArticleKey(article);
      const articleLink = article.link.trim();
      const removalAnimationMode = collapsingArticles[articleKey]?.mode ?? null;

      return (
        <FeedListRow
          articleKey={articleKey}
          dataIndex={options?.dataIndex}
          initialMeasuredHeight={options?.initialMeasuredHeight}
          key={options?.key ?? articleKey}
          onMeasuredHeightChange={(height) => {
            // Persist the last stable row height so future virtualization and
            // retained-exit passes do not have to guess from the default size.
            retainedVisibleArticleHeightsRef.current.set(articleKey, height);
          }}
          onMeasureElement={options?.onMeasureElement}
          removalAnimationMode={removalAnimationMode}
          shouldAnimateReflow={shouldAnimateRowReflow({
            articleKey,
            removalAnimationMode,
          })}
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
            onPrepareExpand={onPrepareExpand}
            onSwipeRead={onSwipeRead}
            onToggle={onToggle}
            onToggleRead={onToggleRead}
            onToggleStarred={onToggleStarred}
            removalAnimationMode={removalAnimationMode}
            showFavicon={showFavicons}
            useRichFormatting={hydratedArticleLinks[articleLink]}
          />
        </FeedListRow>
      );
    },
    [
      collapsingArticles,
      expandedArticleKey,
      hydratedArticleLinks,
      hydratingArticleLinks,
      isDark,
      isMobile,
      onPrepareExpand,
      onExpandedSwipeRead,
      onSwipeRead,
      onToggle,
      onToggleRead,
      onToggleStarred,
      showFavicons,
      shouldAnimateRowReflow,
      updatingArticleState,
    ],
  );

  const loadMoreSentinel =
    renderedFeed.length > 0 && visibleArticleCount < filteredFeed.length ? (
      <div
        aria-hidden="true"
        data-feed-load-more-sentinel="true"
        ref={loadMoreSentinelRef}
        // Keep the sentinel height aligned with the same threshold used by both
        // the scroll-distance gate and the intersection observer root margin.
        style={{ height: `${FEED_LOAD_MORE_THRESHOLD_PX}px` }}
      />
    ) : null;

  return (
    <>
      {isInitialLoading ? (
        <DashboardFeedListSkeleton />
      ) : renderedFeed.length === 0 ? (
        <motion.div
          animate={{ opacity: 1, y: 0 }}
          className="
            mx-auto flex w-full max-w-3xl items-center justify-center px-4 py-20
            sm:py-32
            lg:max-w-none lg:px-6 lg:py-40
          "
          initial={{ opacity: 0, y: 10 }}
          key="feed-empty"
          transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
        >
          <motion.div
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center gap-6 text-center"
            initial={{ opacity: 0, y: 8 }}
            key={searchTerm ? "empty-search" : "empty-default"}
            transition={{ delay: 0.04, duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="relative flex items-center justify-center">
              <div
                className={`
                  absolute size-36 rounded-full opacity-15 blur-2xl
                  ${searchTerm ? `bg-muted-foreground` : `bg-emerald-500`}
                `}
              />
              <div
                className={`
                  absolute size-28 rounded-full border
                  ${searchTerm ? `border-border/40` : `border-emerald-500/10`}
                `}
              />
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
                className="text-xl font-semibold tracking-tight text-foreground"
              >
                {searchTerm ? "No results" : "You're up to date"}
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
          </motion.div>
        </motion.div>
      ) : (
        <div
          className="w-full min-w-0"
          key="feed-list"
          ref={handleViewportHostRef}
        >
          {shouldVirtualizeFeed ? (
            <motion.div
              className="
                relative mx-auto w-full max-w-3xl px-1
                lg:max-w-none lg:px-3
              "
              data-feed-virtualizer="true"
              layoutScroll
            >
              {/*
                Manual spacer blocks mirror TanStack Virtual's computed start/end
                offsets. The list intentionally does not use paddingStart here,
                because that combination can create a visible gap above the first
                article.
              */}
              {hasMeasuredVirtualViewport && virtualFeedTopPadding > 0 ? (
                <div
                  aria-hidden="true"
                  style={{ height: `${virtualFeedTopPadding}px` }}
                />
              ) : null}
              {hasMeasuredVirtualViewport
                ? virtualFeedItems.map((virtualFeedItem) => {
                    const article = renderedFeed.at(virtualFeedItem.index);
                    if (article === undefined) {
                      return null;
                    }

                    return renderArticleCard(article, {
                      dataIndex: virtualFeedItem.index,
                      initialMeasuredHeight:
                        retainedVisibleArticleHeightsRef.current.get(
                          getArticleKey(article),
                        ) ?? undefined,
                      key: String(virtualFeedItem.key),
                      onMeasureElement: (element) => {
                        if (element) {
                          // Measure the outer row shell so TanStack Virtual sees
                          // the same box model that participates in layout.
                          feedVirtualizer.measureElement(element);
                        }
                      },
                    });
                  })
                : fallbackVirtualFeedItems.map((article) =>
                    renderArticleCard(article, {
                      initialMeasuredHeight:
                        retainedVisibleArticleHeightsRef.current.get(
                          getArticleKey(article),
                        ) ?? undefined,
                      key: getArticleKey(article),
                    }),
                  )}
              {hasMeasuredVirtualViewport && virtualFeedBottomPadding > 0 ? (
                <div
                  aria-hidden="true"
                  style={{ height: `${virtualFeedBottomPadding}px` }}
                />
              ) : null}
              {loadMoreSentinel}
            </motion.div>
          ) : (
            <div
              className="
                relative mx-auto grid w-full max-w-3xl grid-cols-1 px-1
                lg:max-w-none lg:px-3
              "
            >
              {renderedFeed.map((article) =>
                renderArticleCard(article, {
                  initialMeasuredHeight:
                    retainedVisibleArticleHeightsRef.current.get(
                      getArticleKey(article),
                    ) ?? undefined,
                  key: getArticleKey(article),
                }),
              )}
              {loadMoreSentinel}
            </div>
          )}
        </div>
      )}
    </>
  );
});
