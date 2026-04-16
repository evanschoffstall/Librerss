import { useCallback, useLayoutEffect, useRef, useState } from "react";

export function useFeedPaginationLocalState(options: {
  articlesPerPage: number;
  filteredFeedLength: number;
  hasCollapsingArticles: boolean;
  isLoadingMore: boolean;
  isRefreshing: boolean;
  refreshEpoch: number;
}) {
  const boundaryRefs = useFeedPaginationBoundaryRefs();
  const historyRefs = useFeedPaginationHistoryRefs(options);
  const previousRefreshEpochForRenderRef = useRef(options.refreshEpoch);
  const [visibleArticleCount, setVisibleArticleCount] = useState(
    options.articlesPerPage,
  );
  const loadMoreSentinelRef = useCallback((node: HTMLDivElement | null) => {
    void node;
  }, []);
  const commitVisibleArticleCount = useCallback(
    (nextVisibleCount: number) => {
      historyRefs.visibleArticleCountRef.current = nextVisibleCount;

      if (historyRefs.isMountedRef.current) {
        setVisibleArticleCount(nextVisibleCount);
      }
    },
    [historyRefs.isMountedRef, historyRefs.visibleArticleCountRef],
  );

  const shouldClampVisibleArticleCountForRefresh =
    options.isRefreshing &&
    previousRefreshEpochForRenderRef.current !== options.refreshEpoch;
  const effectiveVisibleArticleCount = shouldClampVisibleArticleCountForRefresh
    ? Math.min(visibleArticleCount, options.articlesPerPage)
    : visibleArticleCount;

  if (shouldClampVisibleArticleCountForRefresh) {
    historyRefs.visibleArticleCountRef.current = effectiveVisibleArticleCount;
  }

  useLayoutEffect(() => {
    previousRefreshEpochForRenderRef.current = options.refreshEpoch;
  }, [options.refreshEpoch]);

  return {
    commitVisibleArticleCount,
    ...boundaryRefs,
    ...historyRefs,
    loadMoreSentinelRef,
    visibleArticleCount: effectiveVisibleArticleCount,
  };
}

function useFeedPaginationBoundaryRefs() {
  const isInvertedLoadBoundaryArmedRef = useRef(true);
  const isStandardLoadBoundaryArmedRef = useRef(true);
  const paginationFrameRef = useRef<null | number>(null);
  const normalScrollIntentSuppressionFrameRef = useRef<null | number>(null);
  const lastStandardScrollTopRef = useRef<null | number>(null);
  const lastAutoFillListHeightRef = useRef<null | number>(null);

  return {
    isInvertedLoadBoundaryArmedRef,
    isStandardLoadBoundaryArmedRef,
    lastAutoFillListHeightRef,
    lastStandardScrollTopRef,
    normalScrollIntentSuppressionFrameRef,
    paginationFrameRef,
  };
}

function useFeedPaginationHistoryRefs(options: {
  articlesPerPage: number;
  filteredFeedLength: number;
  hasCollapsingArticles: boolean;
  isLoadingMore: boolean;
  refreshEpoch: number;
}) {
  const hasCollapsingArticlesRef = useRef(options.hasCollapsingArticles);
  const isMountedRef = useRef(true);
  const filteredFeedLengthRef = useRef(options.filteredFeedLength);
  const previousFilteredFeedLengthRef = useRef(options.filteredFeedLength);
  const previousIsLoadingMoreRef = useRef(options.isLoadingMore);
  const previousRefreshEpochRef = useRef(options.refreshEpoch);
  const visibleArticleCountRef = useRef(options.articlesPerPage);

  return {
    filteredFeedLengthRef,
    hasCollapsingArticlesRef,
    isMountedRef,
    previousFilteredFeedLengthRef,
    previousIsLoadingMoreRef,
    previousRefreshEpochRef,
    visibleArticleCountRef,
  };
}
