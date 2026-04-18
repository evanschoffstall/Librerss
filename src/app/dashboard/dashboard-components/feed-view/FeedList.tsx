"use client";

/**
 * Renders the dashboard article feed inside the shared Radix ScrollArea.
 *
 * The feed delegates row windowing and dynamic-height measurement to a
 * feed-owned TanStack Virtual surface instead of manual paging, sentinels,
 * FLIP reflow, or library-managed scroll containers. Feed rows stay visually
 * idle so expand, collapse, read, and filter updates resolve through plain
 * layout changes.
 */

import { AnimatePresence, motion } from "motion/react";
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

import type { Article } from "@/lib/core";

import { useServerLoadSkeletonHold } from "@/app/dashboard/dashboard-components/feed-view/feed-list-surface-state/useServerLoadSkeletonHold";
import {
  isInvertedFeedScrollMode,
  resolveFeedScrollMode,
  resolveFeedScrollModeArticles,
  syncViewportToBottomIfNeeded,
} from "@/app/dashboard/dashboard-components/feed-view/feed-list-surface-state/view-core";
import { FeedArticleRow } from "@/app/dashboard/dashboard-components/feed-view/FeedArticleRow";
import { FeedEmptyState } from "@/app/dashboard/dashboard-components/feed-view/FeedEmptyState";
import { type FeedListProps } from "@/app/dashboard/dashboard-components/feed-view/FeedList.types";
import { FeedVirtualList } from "@/app/dashboard/dashboard-components/feed-view/FeedVirtualList";
import { useFeedListSurfaceState } from "@/app/dashboard/dashboard-components/feed-view/list-state";
import { getArticleKey } from "@/app/dashboard/dashboard-services/article-collection";
import { MOBILE_INVERTED_SCROLL_STORAGE_KEY } from "@/app/dashboard/dashboard-services/dashboard-constants";
import { type CollapsingArticles } from "@/app/dashboard/display-types";
import { useIsBelowDesktop, useLocalStorage } from "@/lib/hooks";

import { FeedListSkeleton, FeedLoadMoreSkeletonRows } from "./FeedListSkeleton";

const EMPTY_COLLAPSING_ARTICLES: Readonly<CollapsingArticles> = {};
/**
 *
 */
const EMPTY_PRE_EXPAND_VIEWPORT_SNAPSHOT = () => null;

const FEED_DEFAULT_ITEM_HEIGHT_PX = 120;

/** Shared class string for the virtualized feed wrapper and list frame elements. */
const FEED_LIST_FRAME_CLASSNAME = "flex h-full min-h-0 w-full min-w-0 flex-col";
/** Class string for the outermost surface container. */
const FEED_LIST_SURFACE_CLASSNAME = "flex min-h-0 w-full min-w-0 flex-col";
/** Class string for the virtualizer height owner; it must not inherit h-full. */
const FEED_VIRTUALIZER_CLASSNAME = "w-full min-w-0 flex-none";
/** Inline style forcing the surface and its children to fill the available height. */
const FEED_LIST_FILL_STYLE = { height: "100%" } as const;
/** Motion transition applied when the skeleton exits. */
const SKELETON_EXIT_TRANSITION = {
  duration: 0.14,
  ease: [0.16, 1, 0.3, 1] as const,
};
/** Motion transition applied when non-feed placeholder states enter. */
const CONTENT_ENTER_TRANSITION = {
  duration: 0.35,
  ease: [0.16, 1, 0.3, 1] as const,
};
const isInvertedScrollFeatureEnabledInRuntime =
  process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test";

/**
 * @param viewport
 * @param top
 */
function syncViewportScrollTop(viewport: HTMLElement, top: number) {
  if (typeof viewport.scrollTo === "function") {
    viewport.scrollTo({
      behavior: "auto",
      top,
    });
  }

  if (Math.abs(viewport.scrollTop - top) > 1) {
    viewport.scrollTop = top;
  }
}

export const FeedList = memo(
  /**
   * @param root0
   * @param root0.animatingInArticleKeys
   * @param root0.articleFilter
   * @param root0.articlesPerPage
   * @param root0.canLoadMoreFromServer
   * @param root0.collapsingArticles
   * @param root0.expandedArticleKey
   * @param root0.feedViewKey
   * @param root0.filteredFeed
   * @param root0.getPreExpandViewportSnapshot
   * @param root0.hasConfiguredFeeds
   * @param root0.hydratedArticleLinks
   * @param root0.hydratingArticleLinks
   * @param root0.isCollapseScrollRestoreActive
   * @param root0.isInitialLoading
   * @param root0.isLoadingMore
   * @param root0.isRefreshing
   * @param root0.loadingMoreArticleCount
   * @param root0.onEnteringDone
   * @param root0.onExpandedSwipeRead
   * @param root0.onLoadMore
   * @param root0.onPrepareExpand
   * @param root0.onSwipeRead
   * @param root0.onToggle
   * @param root0.onToggleRead
   * @param root0.onToggleStarred
   * @param root0.refreshEpoch
   * @param root0.searchTerm
   * @param root0.showFavicons
   * @param root0.updatingArticleState
   */
  function FeedList({
    animatingInArticleKeys,
    articleFilter,
    articlesPerPage,
    canLoadMoreFromServer: canLoadMoreFromServerProp,
    collapsingArticles = EMPTY_COLLAPSING_ARTICLES,
    expandedArticleKey,
    feedViewKey,
    filteredFeed,
    getPreExpandViewportSnapshot,
    hasConfiguredFeeds,
    hydratedArticleLinks,
    hydratingArticleLinks,
    isCollapseScrollRestoreActive = false,
    isInitialLoading,
    isLoadingMore = false,
    isRefreshing: _isRefreshing,
    loadingMoreArticleCount,
    onEnteringDone,
    onExpandedSwipeRead,
    onLoadMore,
    onPrepareExpand,
    onSwipeRead,
    onToggle,
    onToggleRead,
    onToggleStarred,
    refreshEpoch = 0,
    searchTerm,
    showFavicons,
    updatingArticleState,
  }: FeedListProps) {
    const isBelowDesktop = useIsBelowDesktop();
    const [mobileInvertedScroll] = useLocalStorage(
      MOBILE_INVERTED_SCROLL_STORAGE_KEY,
      false,
    );
    const canLoadMoreFromServer =
      canLoadMoreFromServerProp ?? typeof onLoadMore === "function";
    const feedScrollMode = resolveFeedScrollMode(
      isBelowDesktop,
      isInvertedScrollFeatureEnabledInRuntime && mobileInvertedScroll,
    );
    const isActiveInvertedScroll = isInvertedFeedScrollMode(feedScrollMode);
    const { resolvedTheme } = useTheme();
    const isDark = (resolvedTheme ?? "dark") === "dark";
    const isMountedRef = useRef(true);
    const [measuredTotalListHeight, setMeasuredTotalListHeight] = useState<
      null | number
    >(null);
    const scrollViewportRef = useRef<HTMLElement | null>(null);
    const invertedHeightFloorRef = useRef<null | number>(null);
    const invertedHydrationAnchorFrameRef = useRef<null | number>(null);
    const previousExpandedArticleKeyRef = useRef(expandedArticleKey);
    const preExpandViewportSnapshotGetter =
      getPreExpandViewportSnapshot ?? EMPTY_PRE_EXPAND_VIEWPORT_SNAPSHOT;
    const {
      contentKey,
      feedSurfaceMode,
      handleViewportHostRef,
      hasMoreArticles,
      hasSearchTerm,
      invertedPaginationAnchorRef,
      isCachedPageRevealing,
      isInvertedScroll,
      loadMoreSentinelRef,
      maybeAutoFillViewport,
      scrollViewport,
      shouldAutoAnchorInvertedScroll,
      shouldLockInitialNormalScroll,
      shouldShowViewportResolutionSkeleton,
      shouldUseVirtualizedFeed,
      syncInvertedExpansionScrollLock,
      syncInvertedPaginationAnchor,
      trimmedSearchTerm,
      visibleArticleCount,
    } = useFeedListSurfaceState({
      articleFilter,
      articlesPerPage,
      canLoadMoreFromServer,
      collapsingArticles,
      expandedArticleKey,
      feedViewKey,
      filteredFeedLength: filteredFeed.length,
      getPreExpandViewportSnapshot: preExpandViewportSnapshotGetter,
      invertedScrollAnchorIndex: 0,
      isCollapseScrollRestoreActive,
      isInitialLoading,
      isInvertedScroll: isActiveInvertedScroll,
      isLoadingMore,
      isRefreshing: _isRefreshing,
      onLoadMore,
      refreshEpoch,
      searchTerm,
    });

    const visibleFeed = filteredFeed.slice(0, visibleArticleCount);
    const shouldShowLoadMoreBoundary = hasMoreArticles || canLoadMoreFromServer;
    const isServerLoadSkeletonActive = useServerLoadSkeletonHold(isLoadingMore);
    const showLoadMoreSkeletons =
      isServerLoadSkeletonActive || isCachedPageRevealing;
    const loadMoreSkeletonCount = showLoadMoreSkeletons
      ? loadingMoreArticleCount || articlesPerPage
      : 0;

    const feedData = useMemo(
      () => resolveFeedScrollModeArticles(visibleFeed, feedScrollMode),
      [feedScrollMode, visibleFeed],
    );
    const shouldUseVirtualizedFeedSurface =
      shouldUseVirtualizedFeed &&
      expandedArticleKey === null &&
      !(isInvertedScroll && isCollapseScrollRestoreActive);

    scrollViewportRef.current = scrollViewport;

    useEffect(() => {
      return () => {
        isMountedRef.current = false;

        if (invertedHydrationAnchorFrameRef.current !== null) {
          window.cancelAnimationFrame(invertedHydrationAnchorFrameRef.current);
        }
      };
    }, []);

    useEffect(() => {
      invertedHeightFloorRef.current = null;
    }, [articleFilter, feedViewKey, isActiveInvertedScroll, searchTerm]);

    useLayoutEffect(() => {
      const previousExpandedArticleKey = previousExpandedArticleKeyRef.current;
      previousExpandedArticleKeyRef.current = expandedArticleKey;

      if (!isActiveInvertedScroll) {
        return;
      }

      if (expandedArticleKey !== null) {
        invertedHeightFloorRef.current = null;
        return;
      }

      if (previousExpandedArticleKey === null) {
        return;
      }

      syncInvertedExpansionScrollLock();

      const viewport = scrollViewportRef.current;

      if (
        viewport &&
        viewport.scrollHeight > (invertedHeightFloorRef.current ?? 0)
      ) {
        invertedHeightFloorRef.current = viewport.scrollHeight;
      }
    }, [
      expandedArticleKey,
      isActiveInvertedScroll,
      syncInvertedExpansionScrollLock,
    ]);

    const prevCollapsingArticleCountRef = useRef(
      Object.keys(collapsingArticles).length,
    );
    useLayoutEffect(() => {
      if (!isActiveInvertedScroll || expandedArticleKey !== null) {
        return;
      }

      const previousCount = prevCollapsingArticleCountRef.current;
      const currentCount = Object.keys(collapsingArticles).length;
      prevCollapsingArticleCountRef.current = currentCount;

      if (currentCount > 0 && previousCount === 0) {
        const viewport = scrollViewportRef.current;

        if (
          viewport &&
          viewport.scrollHeight > (invertedHeightFloorRef.current ?? 0)
        ) {
          invertedHeightFloorRef.current = viewport.scrollHeight;
        }
      }
    }, [collapsingArticles, expandedArticleKey, isActiveInvertedScroll]);

    const virtualizedListHeight = useMemo(() => {
      if (measuredTotalListHeight === null) {
        return null;
      }

      const baseHeight = Math.max(
        Math.ceil(measuredTotalListHeight),
        scrollViewport?.clientHeight ?? 0,
      );

      if (!isActiveInvertedScroll) {
        return baseHeight;
      }

      return Math.max(baseHeight, invertedHeightFloorRef.current ?? 0);
    }, [
      isActiveInvertedScroll,
      measuredTotalListHeight,
      scrollViewport?.clientHeight,
    ]);
    const lastFeedArticle = feedData.at(-1);
    const lastFeedArticleKey = lastFeedArticle
      ? getArticleKey(lastFeedArticle)
      : null;

    useLayoutEffect(() => {
      if (
        !isInvertedScroll ||
        scrollViewport === null ||
        virtualizedListHeight === null ||
        !shouldAutoAnchorInvertedScroll()
      ) {
        return;
      }

      syncViewportToBottomIfNeeded(scrollViewport);
    }, [
      isInvertedScroll,
      scrollViewport,
      shouldAutoAnchorInvertedScroll,
      virtualizedListHeight,
    ]);

    useLayoutEffect(() => {
      if (
        !isInvertedScroll ||
        scrollViewport === null ||
        !shouldAutoAnchorInvertedScroll() ||
        feedData.length === 0
      ) {
        if (invertedHydrationAnchorFrameRef.current !== null) {
          window.cancelAnimationFrame(invertedHydrationAnchorFrameRef.current);
          invertedHydrationAnchorFrameRef.current = null;
        }

        return;
      }

      if (syncViewportToBottomIfNeeded(scrollViewport)) {
        return;
      }

      invertedHydrationAnchorFrameRef.current = window.requestAnimationFrame(
        () => {
          invertedHydrationAnchorFrameRef.current = null;
          syncViewportToBottomIfNeeded(scrollViewport);
        },
      );

      return () => {
        if (invertedHydrationAnchorFrameRef.current !== null) {
          window.cancelAnimationFrame(invertedHydrationAnchorFrameRef.current);
          invertedHydrationAnchorFrameRef.current = null;
        }
      };
    }, [
      feedData.length,
      isInvertedScroll,
      scrollViewport,
      shouldAutoAnchorInvertedScroll,
    ]);

    const renderFeedRow = useCallback(
      (article: Article) => {
        const articleKey = getArticleKey(article);
        const removalAnimationMode =
          collapsingArticles[articleKey]?.mode ?? null;
        const isHydrating = hydratingArticleLinks[article.link] ?? false;
        const isUpdatingState = updatingArticleState[articleKey] ?? false;
        const useRichFormatting = hydratedArticleLinks[article.link] ?? false;
        const isEntering = animatingInArticleKeys?.has(articleKey) ?? false;

        return (
          <FeedArticleRow
            article={article}
            articleKey={articleKey}
            hasScrapedContent={Boolean(article.hasFullContent)}
            isDark={isDark}
            isEntering={isEntering}
            isExpanded={expandedArticleKey === articleKey}
            isHydrating={isHydrating}
            isLastRow={articleKey === lastFeedArticleKey}
            isMobile={isBelowDesktop}
            isUpdatingState={isUpdatingState}
            key={articleKey}
            onEnteringDone={onEnteringDone}
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
        animatingInArticleKeys,
        collapsingArticles,
        expandedArticleKey,
        hydratedArticleLinks,
        hydratingArticleLinks,
        isDark,
        isBelowDesktop,
        lastFeedArticleKey,
        onEnteringDone,
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

    const showEmptyState = !isInitialLoading && filteredFeed.length === 0;
    const applyFeedSurfaceLayout = useCallback(
      (element: HTMLElement | null) => {
        if (!element) {
          return;
        }

        element.style.display = "flex";
        element.style.flexDirection = "column";
        element.style.height = "100%";
        element.style.minHeight = "0";
      },
      [],
    );

    const handleFeedSurfaceRef = useCallback(
      (node: HTMLDivElement | null) => {
        if (node) {
          applyFeedSurfaceLayout(node);
          applyFeedSurfaceLayout(node.parentElement);
          applyFeedSurfaceLayout(node.parentElement?.parentElement ?? null);
        }

        if (isInitialLoading || showEmptyState) {
          handleViewportHostRef(null);
          return;
        }

        handleViewportHostRef(node);
      },
      [
        applyFeedSurfaceLayout,
        handleViewportHostRef,
        isInitialLoading,
        showEmptyState,
      ],
    );

    return (
      <>
        <div
          className={FEED_LIST_SURFACE_CLASSNAME}
          data-feed-surface-mode={feedSurfaceMode}
          data-feed-total-list-height={
            measuredTotalListHeight !== null
              ? `${Math.round(measuredTotalListHeight)}`
              : undefined
          }
          data-inverted-scroll={isInvertedScroll ? "true" : undefined}
          ref={handleFeedSurfaceRef}
          style={FEED_LIST_FILL_STYLE}
        >
          <AnimatePresence initial={false} mode="wait">
            {isInitialLoading || shouldShowViewportResolutionSkeleton ? (
              <motion.div
                animate={{ opacity: 1, scale: 1 }}
                className={FEED_LIST_FRAME_CLASSNAME}
                exit={{ opacity: 0, scale: 0.995 }}
                initial={{ opacity: 1, scale: 1 }}
                key={contentKey}
                style={FEED_LIST_FILL_STYLE}
                transition={SKELETON_EXIT_TRANSITION}
              >
                <FeedListSkeleton isInvertedScroll={isInvertedScroll} />
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
                transition={CONTENT_ENTER_TRANSITION}
              >
                <FeedEmptyState
                  articleFilter={articleFilter}
                  hasConfiguredFeeds={hasConfiguredFeeds}
                  hasSearchTerm={hasSearchTerm}
                  trimmedSearchTerm={trimmedSearchTerm}
                />
              </motion.div>
            ) : (
              <motion.div
                className={FEED_LIST_FRAME_CLASSNAME}
                initial={false}
                key={contentKey}
                style={FEED_LIST_FILL_STYLE}
              >
                {shouldUseVirtualizedFeedSurface && scrollViewport !== null ? (
                  <>
                    {/*
                     * Skeleton rows for the next server page live OUTSIDE the
                     * virtualized content tree so they appear via normal React
                     * reconciliation the moment isLoadingMore becomes true.
                     *
                     * Keeping them outside the measured row window avoids coupling the
                     * loading placeholder to row measurement and ensures the skeletons
                     * paint immediately during the server round trip.
                     *
                     * Inverted mode: skeletons appear at the top (older articles load upward).
                     * Standard mode: skeletons appear at the bottom (newer pages append downward).
                     * The IntersectionObserver sentinel stays inside the virtualizer so
                     * it fires at the correct virtual position.
                     */}
                    {isInvertedScroll &&
                    showLoadMoreSkeletons &&
                    loadMoreSkeletonCount > 0 ? (
                      <div data-feed-load-more-skeletons="true">
                        <FeedLoadMoreSkeletonRows
                          count={loadMoreSkeletonCount}
                        />
                      </div>
                    ) : null}
                    <FeedVirtualList
                      articles={feedData}
                      className={FEED_VIRTUALIZER_CLASSNAME}
                      estimatedItemHeight={FEED_DEFAULT_ITEM_HEIGHT_PX}
                      expandedArticleKey={expandedArticleKey}
                      feedViewKey={feedViewKey}
                      isCollapseScrollRestoreActive={
                        isCollapseScrollRestoreActive
                      }
                      key={`${feedViewKey}:${isInvertedScroll ? "inv" : "std"}`}
                      loadMoreSentinelRef={loadMoreSentinelRef}
                      minimumTotalListHeight={
                        isInvertedScroll
                          ? (virtualizedListHeight ?? undefined)
                          : undefined
                      }
                      onTotalListHeightChange={(nextTotalListHeight) => {
                        if (!isMountedRef.current) {
                          return;
                        }

                        const viewport = scrollViewportRef.current;
                        const shouldAutoAnchorViewport =
                          isInvertedScroll && shouldAutoAnchorInvertedScroll();

                        if (isInvertedScroll && viewport) {
                          const activePaginationAnchor =
                            invertedPaginationAnchorRef.current;

                          if (
                            activePaginationAnchor !== null &&
                            activePaginationAnchor.anchorArticleKey === null
                          ) {
                            const nextAnchoredScrollTop = Math.max(
                              0,
                              activePaginationAnchor.initialScrollTop +
                                (nextTotalListHeight -
                                  activePaginationAnchor.initialScrollHeight),
                            );

                            syncViewportScrollTop(
                              viewport,
                              nextAnchoredScrollTop,
                            );
                            activePaginationAnchor.initialScrollHeight =
                              nextTotalListHeight;
                            activePaginationAnchor.initialScrollTop =
                              nextAnchoredScrollTop;
                          }

                          const minimumViewportFloor =
                            viewport.scrollTop + viewport.clientHeight;

                          if (invertedPaginationAnchorRef.current !== null) {
                            invertedHeightFloorRef.current = Math.max(
                              invertedHeightFloorRef.current ?? 0,
                              nextTotalListHeight,
                              minimumViewportFloor,
                            );
                          } else if (!shouldAutoAnchorViewport) {
                            invertedHeightFloorRef.current = Math.max(
                              nextTotalListHeight,
                              minimumViewportFloor,
                            );
                          } else {
                            invertedHeightFloorRef.current = null;
                          }
                        }

                        setMeasuredTotalListHeight((currentHeight) =>
                          currentHeight === nextTotalListHeight
                            ? currentHeight
                            : nextTotalListHeight,
                        );

                        if (isInvertedScroll) {
                          syncInvertedExpansionScrollLock();
                          syncInvertedPaginationAnchor();

                          if (
                            shouldAutoAnchorViewport &&
                            invertedPaginationAnchorRef.current === null
                          ) {
                            syncViewportToBottomIfNeeded(scrollViewport);
                          }
                        } else if (shouldLockInitialNormalScroll()) {
                          syncViewportScrollTop(scrollViewport, 0);
                        }

                        maybeAutoFillViewport(
                          Math.max(
                            nextTotalListHeight,
                            invertedHeightFloorRef.current ?? 0,
                          ),
                        );
                      }}
                      renderArticle={renderFeedRow}
                      scrollMode={feedScrollMode}
                      scrollViewport={scrollViewport}
                      showLoadMoreBoundary={shouldShowLoadMoreBoundary}
                    />
                    {!isInvertedScroll &&
                    showLoadMoreSkeletons &&
                    loadMoreSkeletonCount > 0 ? (
                      <div data-feed-load-more-skeletons="true">
                        <FeedLoadMoreSkeletonRows
                          count={loadMoreSkeletonCount}
                        />
                      </div>
                    ) : null}
                  </>
                ) : (
                  <>
                    {isInvertedScroll && shouldShowLoadMoreBoundary ? (
                      <div
                        className="h-px w-full"
                        data-feed-load-more-sentinel="true"
                        ref={loadMoreSentinelRef}
                      />
                    ) : null}
                    {isInvertedScroll &&
                    showLoadMoreSkeletons &&
                    loadMoreSkeletonCount > 0 ? (
                      <div data-feed-load-more-skeletons="true">
                        <FeedLoadMoreSkeletonRows
                          count={loadMoreSkeletonCount}
                        />
                      </div>
                    ) : null}
                    {feedData.map(renderFeedRow)}
                    {!isInvertedScroll &&
                    showLoadMoreSkeletons &&
                    loadMoreSkeletonCount > 0 ? (
                      <div data-feed-load-more-skeletons="true">
                        <FeedLoadMoreSkeletonRows
                          count={loadMoreSkeletonCount}
                        />
                      </div>
                    ) : null}
                    {!isInvertedScroll && shouldShowLoadMoreBoundary ? (
                      <div
                        className="h-px w-full"
                        data-feed-load-more-sentinel="true"
                        ref={loadMoreSentinelRef}
                      />
                    ) : null}
                  </>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </>
    );
  },
);
