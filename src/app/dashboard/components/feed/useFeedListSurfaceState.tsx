import { type ComponentPropsWithRef, forwardRef, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { DASHBOARD_EVENTS } from "../../constants";
import {
  ARTICLE_DEEXPAND_REMOVAL_ANIMATION_MS,
  ARTICLE_REMOVAL_ANIMATION_MS,
  ARTICLE_SCROLL_RESTORE_BUFFER_MS,
  type ArticleViewportSnapshot,
  type CollapsingArticles,
} from "../../hooks/useArticleCollapseState";

const FEED_LOAD_MORE_THRESHOLD_PX = 504;
const FEED_MIN_SCROLLABLE_OVERFLOW_PX = 1;

interface ArticleExpandPreparedDetail {
  articleKey: string;
}
type FeedSurfaceMode = "empty" | "plain" | "skeleton" | "virtualized";

type FeedViewportResolutionState = "missing" | "pending" | "ready";

interface InvertedExpansionScrollLockObserverOptions {
  articleKey: null | string;
  onLayoutChange: () => void;
  viewport: HTMLElement;
}

interface InvertedExpansionScrollLockState {
  anchorViewportOffsetTop: number;
  animationFrameId: number;
  articleKey: null | string;
  baselineScrollTop: number;
  disconnectLayoutObservers: (() => void) | null;
  mode: "collapsing" | "expand" | "restore" | "stable";
  releaseAt: null | number;
  viewport: HTMLElement;
  viewportOverflowAnchor: string;
}

interface InvertedExpansionViewportSnapshot {
  articleHeaderViewportOffsetTop: number;
  articleKey: string;
  viewport: HTMLElement;
  viewportScrollTop: number;
}

interface PrimedUnreadRemovalState {
  articleKeys: ReadonlySet<string>;
  expiresAt: number;
}

interface UseFeedListSurfaceStateOptions {
  articleFilter: string;
  articlesPerPage: number;
  collapsingArticles: Readonly<CollapsingArticles>;
  expandedArticleKey: null | string;
  feedViewKey: string;
  filteredFeedLength: number;
  getPreExpandViewportSnapshot: (articleKey: string) => ArticleViewportSnapshot | null;
  invertedScrollAnchorIndex: number;
  isCollapseScrollRestoreActive: boolean;
  isInitialLoading: boolean;
  /** When true the feed renders bottom-to-top (newest at bottom, pagination at top). */
  isInvertedScroll: boolean;
  refreshEpoch: number;
  searchTerm: string;
}

/** Selects the visible survivor article whose header should anchor unread-removal scroll compensation. */
export function findVisibleInvertedRemovalAnchorArticleKey(
  excludedArticleKeys: ReadonlySet<string>,
) {
  const viewport = findInvertedExpansionLockViewport();

  if (!viewport) {
    return null;
  }

  const viewportRect = viewport.getBoundingClientRect();
  const visibleArticles = Array.from(
    viewport.querySelectorAll<HTMLElement>("article[data-article-key]"),
  )
    .map((articleElement) => {
      const articleKey = articleElement.dataset.articleKey ?? null;

      if (!articleKey || excludedArticleKeys.has(articleKey)) {
        return null;
      }

      const headerElement = articleElement.querySelector<HTMLElement>(
        "[data-article-swipe-zone='header']",
      );

      if (!headerElement) {
        return null;
      }

      const headerRect = headerElement.getBoundingClientRect();

      if (
        headerRect.bottom <= viewportRect.top ||
        headerRect.top >= viewportRect.bottom
      ) {
        return null;
      }

      return {
        articleKey,
        fullyVisible:
          headerRect.top >= viewportRect.top &&
          headerRect.bottom <= viewportRect.bottom,
        headerTop: headerRect.top,
      };
    })
    .filter((entry) => entry !== null)
    .sort((left, right) => {
      if (left.fullyVisible !== right.fullyVisible) {
        return left.fullyVisible ? -1 : 1;
      }

      return left.headerTop - right.headerTop;
    });

  return visibleArticles[0]?.articleKey ?? null;
}

export function useFeedListSurfaceState({
  articleFilter,
  articlesPerPage,
  collapsingArticles,
  expandedArticleKey,
  feedViewKey,
  filteredFeedLength,
  getPreExpandViewportSnapshot,
  invertedScrollAnchorIndex,
  isCollapseScrollRestoreActive,
  isInitialLoading,
  isInvertedScroll,
  refreshEpoch,
  searchTerm,
}: UseFeedListSurfaceStateOptions) {
  const [scrollViewport, setScrollViewport] = useState<HTMLElement | null>(null);
  const [visibleArticleCount, setVisibleArticleCount] = useState(articlesPerPage);
  const [viewportResolutionState, setViewportResolutionState] =
    useState<FeedViewportResolutionState>("pending");
  const [hasClaimedInvertedScrollOwnership, setHasClaimedInvertedScrollOwnership] =
    useState(false);
  const hasUserScrolledRef = useRef(false);
  const invertedExpansionScrollLockRef =
    useRef<InvertedExpansionScrollLockState | null>(null);
  const invertedExpansionViewportSnapshotRef =
    useRef<InvertedExpansionViewportSnapshot | null>(null);
  const isInvertedScrollRef = useRef(isInvertedScroll);
  isInvertedScrollRef.current = isInvertedScroll;
  const shouldLockNormalInitialScrollRef = useRef(false);
  const loadMoreSentinelRef = useRef<HTMLDivElement | null>(null);
  const hasResolvedInitialViewportRef = useRef(false);
  const previousFeedViewKeyRef = useRef(feedViewKey);
  const expandedArticleKeyRef = useRef(expandedArticleKey);
  expandedArticleKeyRef.current = expandedArticleKey;
  const previousExpandedArticleKeyRef = useRef(expandedArticleKey);
  const previousCollapsingArticleKeysRef = useRef<string[]>([]);
  const primedUnreadRemovalRef = useRef<null | PrimedUnreadRemovalState>(null);
  const previousRefreshEpochRef = useRef(refreshEpoch);
  const previousIsInvertedRef = useRef(isInvertedScroll);
  const viewportHostRef = useRef<HTMLDivElement | null>(null);

  const handleViewportHostRef = useCallback((node: HTMLDivElement | null) => {
    viewportHostRef.current = node;
    queueMicrotask(() => {
      const resolvedViewport =
        node?.closest<HTMLElement>("[data-radix-scroll-area-viewport]") ?? null;
      setScrollViewport(resolvedViewport);
      setViewportResolutionState(resolvedViewport ? "ready" : "missing");
    });
  }, []);

  const claimInvertedScrollOwnership = useCallback(() => {
    hasUserScrolledRef.current = true;
    setHasClaimedInvertedScrollOwnership(true);
  }, []);

  useEffect(() => {
    hasUserScrolledRef.current = false;
    setHasClaimedInvertedScrollOwnership(false);
    setVisibleArticleCount(articlesPerPage);
  }, [articleFilter, articlesPerPage, feedViewKey, isInvertedScroll, refreshEpoch, searchTerm]);

  const releaseInvertedExpansionScrollLock = useCallback(() => {
    const lockState = invertedExpansionScrollLockRef.current;

    if (!lockState) {
      return;
    }

    lockState.disconnectLayoutObservers?.();

    if (lockState.animationFrameId !== 0) {
      window.cancelAnimationFrame(lockState.animationFrameId);
    }

    if (lockState.viewport.isConnected) {
      lockState.viewport.style.overflowAnchor =
        isInvertedScrollRef.current && expandedArticleKeyRef.current !== null
          ? "none"
          : lockState.viewportOverflowAnchor;
    }

    invertedExpansionScrollLockRef.current = null;
  }, []);

  const clearInvertedExpansionViewportSnapshot = useCallback(() => {
    invertedExpansionViewportSnapshotRef.current = null;
  }, []);

  const captureInvertedExpansionViewportSnapshot = useCallback((
    articleKey: string,
  ) => {
    const sharedSnapshot = getPreExpandViewportSnapshot(articleKey);

    if (sharedSnapshot) {
      return {
        articleHeaderViewportOffsetTop:
          sharedSnapshot.articleHeaderViewportOffsetTop,
        articleKey: sharedSnapshot.articleKey,
        viewport: sharedSnapshot.viewport,
        viewportScrollTop: sharedSnapshot.viewportScrollTop,
      } satisfies InvertedExpansionViewportSnapshot;
    }

    const articleElement = findInvertedExpansionLockAnchor(articleKey);
    const viewport =
      articleElement?.closest<HTMLElement>("[data-radix-scroll-area-viewport]") ??
      null;

    if (!articleElement || !viewport) {
      return null;
    }

    return {
      articleHeaderViewportOffsetTop: getViewportOffsetTop(
        findInvertedExpansionHeaderAnchor(articleKey) ?? articleElement,
        viewport,
      ),
      articleKey,
      viewport,
      viewportScrollTop: viewport.scrollTop,
    } satisfies InvertedExpansionViewportSnapshot;
  }, [getPreExpandViewportSnapshot]);

  const syncInvertedExpansionScrollLock = useCallback(() => {
    const lockState = invertedExpansionScrollLockRef.current;

    if (!lockState) {
      return;
    }

    if (!lockState.viewport.isConnected) {
      releaseInvertedExpansionScrollLock();
      return;
    }

    const resolvedViewport = resolveInvertedExpansionLockViewport(
      lockState.articleKey,
      lockState.viewport,
    );

    if (!resolvedViewport) {
      releaseInvertedExpansionScrollLock();
      return;
    }

    if (resolvedViewport !== lockState.viewport) {
      lockState.disconnectLayoutObservers?.();
      lockState.viewport.style.overflowAnchor = lockState.viewportOverflowAnchor;
      lockState.viewport = resolvedViewport;
      lockState.viewportOverflowAnchor = resolvedViewport.style.overflowAnchor;
      lockState.disconnectLayoutObservers = observeInvertedExpansionScrollLockLayout(
        {
          articleKey: lockState.articleKey,
          onLayoutChange: syncInvertedExpansionScrollLock,
          viewport: resolvedViewport,
        },
      );
      resolvedViewport.style.overflowAnchor = "none";
    }

    const anchor = findInvertedExpansionHeaderAnchor(lockState.articleKey);
    const targetScrollTop = lockState.mode === "expand" || lockState.mode === "restore"
      ? lockState.baselineScrollTop
      : anchor
        ? lockState.viewport.scrollTop +
          getViewportOffsetTop(anchor, lockState.viewport) -
          lockState.anchorViewportOffsetTop
        : lockState.baselineScrollTop;

    if (Math.abs(lockState.viewport.scrollTop - targetScrollTop) > 0.5) {
      lockState.viewport.scrollTop = targetScrollTop;
    }

    if (lockState.releaseAt !== null) {
      if (performance.now() >= lockState.releaseAt) {
        releaseInvertedExpansionScrollLock();
        return;
      }

      if (lockState.animationFrameId === 0) {
        lockState.animationFrameId = window.requestAnimationFrame(() => {
          if (invertedExpansionScrollLockRef.current) {
            invertedExpansionScrollLockRef.current.animationFrameId = 0;
          }

          syncInvertedExpansionScrollLock();
        });
      }
    }

    if (
      lockState.releaseAt === null &&
      (lockState.mode === "expand" || lockState.mode === "collapsing")
    ) {
      if (lockState.animationFrameId === 0) {
        lockState.animationFrameId = window.requestAnimationFrame(() => {
          if (invertedExpansionScrollLockRef.current) {
            invertedExpansionScrollLockRef.current.animationFrameId = 0;
          }

          syncInvertedExpansionScrollLock();
        });
      }
    }
  }, [releaseInvertedExpansionScrollLock]);

  const startInvertedExpansionScrollLock = useCallback((
    articleKey: null | string,
    snapshot: InvertedExpansionViewportSnapshot | null | undefined,
    mode: "collapsing" | "expand" | "restore" | "stable",
    releaseAt?: null | number,
  ) => {
    if (!scrollViewport) {
      return;
    }

    const existingLockState = invertedExpansionScrollLockRef.current;

    if (existingLockState) {
      existingLockState.disconnectLayoutObservers?.();

      if (existingLockState.animationFrameId !== 0) {
        window.cancelAnimationFrame(existingLockState.animationFrameId);
      }

      if (existingLockState.viewport.isConnected) {
        existingLockState.viewport.style.overflowAnchor =
          existingLockState.viewportOverflowAnchor;
      }
    }

    const resolvedViewport = resolveInvertedExpansionLockViewport(
      articleKey,
      scrollViewport,
    ) ?? scrollViewport;

    const baselineScrollTop = snapshot
      ? snapshot.viewportScrollTop
      : existingLockState?.viewport === resolvedViewport
        ? existingLockState.baselineScrollTop
        : resolvedViewport.scrollTop;
    const anchorViewportOffsetTop = snapshot
      ? snapshot.articleHeaderViewportOffsetTop
      : existingLockState?.viewport === resolvedViewport &&
          existingLockState.articleKey === articleKey
        ? existingLockState.anchorViewportOffsetTop
        : getViewportOffsetTop(
            findInvertedExpansionHeaderAnchor(articleKey),
            resolvedViewport,
          );
    const viewportOverflowAnchor =
      existingLockState?.viewport === resolvedViewport
        ? existingLockState.viewportOverflowAnchor
        : resolvedViewport.style.overflowAnchor;

    invertedExpansionScrollLockRef.current = {
      anchorViewportOffsetTop,
      animationFrameId: 0,
      articleKey,
      baselineScrollTop,
      disconnectLayoutObservers: observeInvertedExpansionScrollLockLayout({
        articleKey,
        onLayoutChange: syncInvertedExpansionScrollLock,
        viewport: resolvedViewport,
      }),
      mode,
      releaseAt: releaseAt ?? null,
      viewport: resolvedViewport,
      viewportOverflowAnchor,
    };

    resolvedViewport.style.overflowAnchor = "none";
    syncInvertedExpansionScrollLock();
  }, [scrollViewport, syncInvertedExpansionScrollLock]);

  const prepareInvertedUnreadRemovalScrollLock = useCallback((
    excludedArticleKeys: Iterable<string>,
    options?: { primeInteraction?: boolean },
  ) => {
    if (!isInvertedScrollRef.current) {
      return;
    }

    claimInvertedScrollOwnership();
    const excludedArticleKeySet = new Set(excludedArticleKeys);

    const anchorArticleKey = findVisibleInvertedRemovalAnchorArticleKey(
      excludedArticleKeySet,
    );

    if (!anchorArticleKey) {
      return;
    }

    const snapshot = captureInvertedExpansionViewportSnapshot(anchorArticleKey);

    if (!snapshot) {
      return;
    }

    const releaseAt =
      performance.now() + ARTICLE_REMOVAL_ANIMATION_MS + ARTICLE_SCROLL_RESTORE_BUFFER_MS;

    if (options?.primeInteraction) {
      primedUnreadRemovalRef.current = {
        articleKeys: excludedArticleKeySet,
        expiresAt: releaseAt,
      };
    }

    startInvertedExpansionScrollLock(
      anchorArticleKey,
      snapshot,
      "stable",
      releaseAt,
    );
  }, [
    captureInvertedExpansionViewportSnapshot,
    claimInvertedScrollOwnership,
    startInvertedExpansionScrollLock,
  ]);

  useLayoutEffect(() => {
    const previousExpandedArticleKey = previousExpandedArticleKeyRef.current;
    const didExpandedArticleChange =
      previousExpandedArticleKey !== expandedArticleKey;

    previousExpandedArticleKeyRef.current = expandedArticleKey;

    if (!isInvertedScroll || !didExpandedArticleChange) {
      return;
    }

    // Once the reader expands or collapses an article, stop treating the
    // inverted surface as an idle bottom-anchored list. The interaction now
    // owns the viewport and height changes must preserve the article position.
    claimInvertedScrollOwnership();

    const nextSnapshot = expandedArticleKey
      ? invertedExpansionViewportSnapshotRef.current?.articleKey === expandedArticleKey
        ? invertedExpansionViewportSnapshotRef.current
        : captureInvertedExpansionViewportSnapshot(expandedArticleKey)
      : previousExpandedArticleKey &&
          invertedExpansionViewportSnapshotRef.current?.articleKey ===
            previousExpandedArticleKey
        ? invertedExpansionViewportSnapshotRef.current
        : null;

    if (expandedArticleKey) {
      invertedExpansionViewportSnapshotRef.current = nextSnapshot;
    }

    startInvertedExpansionScrollLock(
      expandedArticleKey ?? previousExpandedArticleKey,
      nextSnapshot,
      expandedArticleKey === null ? "collapsing" : "expand",
      expandedArticleKey === null
        ? performance.now() +
            ARTICLE_DEEXPAND_REMOVAL_ANIMATION_MS +
            ARTICLE_SCROLL_RESTORE_BUFFER_MS
        : null,
    );
  }, [
    captureInvertedExpansionViewportSnapshot,
    claimInvertedScrollOwnership,
    expandedArticleKey,
    isInvertedScroll,
    startInvertedExpansionScrollLock,
  ]);

  useLayoutEffect(() => {
    const collapsingArticleKeys = Object.keys(collapsingArticles);
    const previousCollapsingArticleKeys = previousCollapsingArticleKeysRef.current;
    previousCollapsingArticleKeysRef.current = collapsingArticleKeys;

    if (
      !isInvertedScroll ||
      articleFilter !== "unread" ||
      expandedArticleKey !== null ||
      collapsingArticleKeys.length === 0
    ) {
      return;
    }

    const previousCollapsingArticleKeySet = new Set(previousCollapsingArticleKeys);
    const newlyCollapsingArticleKeys = collapsingArticleKeys.filter(
      (articleKey) => !previousCollapsingArticleKeySet.has(articleKey),
    );

    if (newlyCollapsingArticleKeys.length === 0) {
      return;
    }

    const primedUnreadRemoval = primedUnreadRemovalRef.current;

    if (
      primedUnreadRemoval &&
      performance.now() < primedUnreadRemoval.expiresAt &&
      newlyCollapsingArticleKeys.every((articleKey) =>
        primedUnreadRemoval.articleKeys.has(articleKey),
      )
    ) {
      return;
    }

    prepareInvertedUnreadRemovalScrollLock(newlyCollapsingArticleKeys);
  }, [
    articleFilter,
    collapsingArticles,
    expandedArticleKey,
    isInvertedScroll,
    prepareInvertedUnreadRemovalScrollLock,
  ]);

  useEffect(() => {
    if (!scrollViewport) {
      return;
    }

    const handleReadToggleIntent = (event: Event) => {
      if (!isInvertedScrollRef.current || articleFilter !== "unread") {
        return;
      }

      const interactionTarget = event.target;

      if (!(interactionTarget instanceof Element)) {
        return;
      }

      const readToggleButton = interactionTarget.closest<HTMLButtonElement>(
        "button[aria-label='Mark as read']",
      );

      if (!readToggleButton) {
        return;
      }

      const articleKey = readToggleButton
        .closest<HTMLElement>("article[data-article-key]")
        ?.dataset.articleKey;

      if (!articleKey) {
        return;
      }

      prepareInvertedUnreadRemovalScrollLock([articleKey], {
        primeInteraction: true,
      });
    };

    const handleViewportReadStart = () => {
      if (!isInvertedScrollRef.current || articleFilter !== "unread") {
        return;
      }

      prepareInvertedUnreadRemovalScrollLock(
        collectFullyVisibleArticleKeys(scrollViewport),
        { primeInteraction: true },
      );
    };

    const handleMarkAllReadStart = () => {
      if (!isInvertedScrollRef.current) {
        return;
      }

      claimInvertedScrollOwnership();
    };

    const handleArticleReadToggleStart = (event: Event) => {
      if (!isInvertedScrollRef.current || articleFilter !== "unread") {
        return;
      }

      const articleKey = readPreparedArticleKey(event);

      if (!articleKey) {
        claimInvertedScrollOwnership();
        return;
      }

      prepareInvertedUnreadRemovalScrollLock([articleKey], {
        primeInteraction: true,
      });
    };

    const handleExpandPrepared = (event: Event) => {
      if (!isInvertedScrollRef.current) {
        return;
      }

      const articleKey = readPreparedArticleKey(event);

      if (!articleKey) {
        return;
      }

      claimInvertedScrollOwnership();

      const snapshot = captureInvertedExpansionViewportSnapshot(articleKey);
      invertedExpansionViewportSnapshotRef.current = snapshot;
      startInvertedExpansionScrollLock(articleKey, snapshot, "expand", null);
    };

    const handleExpandSettled = () => {
      if (invertedExpansionScrollLockRef.current?.mode === "expand") {
        invertedExpansionScrollLockRef.current.mode = "stable";
        invertedExpansionScrollLockRef.current.releaseAt = null;
      }

      syncInvertedExpansionScrollLock();
    };

    const handleCollapseSettled = () => {
      if (invertedExpansionScrollLockRef.current?.mode === "collapsing") {
        invertedExpansionScrollLockRef.current.mode = "restore";
      }

      syncInvertedExpansionScrollLock();
    };

    scrollViewport.addEventListener("pointerdown", handleReadToggleIntent, {
      capture: true,
      passive: true,
    });
    window.addEventListener(
      DASHBOARD_EVENTS.ARTICLE_READ_TOGGLE_START,
      handleArticleReadToggleStart,
    );
    window.addEventListener(
      DASHBOARD_EVENTS.MARK_VIEWPORT_READ_START,
      handleViewportReadStart,
    );
    window.addEventListener(
      DASHBOARD_EVENTS.MARK_ALL_READ_START,
      handleMarkAllReadStart,
    );

    scrollViewport.addEventListener(
      DASHBOARD_EVENTS.ARTICLE_EXPAND_PREPARED,
      handleExpandPrepared,
    );
    scrollViewport.addEventListener(
      DASHBOARD_EVENTS.ARTICLE_EXPAND_SETTLED,
      handleExpandSettled,
    );
    scrollViewport.addEventListener(
      DASHBOARD_EVENTS.ARTICLE_COLLAPSE_SETTLED,
      handleCollapseSettled,
    );

    return () => {
      scrollViewport.removeEventListener("pointerdown", handleReadToggleIntent, true);
      window.removeEventListener(
        DASHBOARD_EVENTS.ARTICLE_READ_TOGGLE_START,
        handleArticleReadToggleStart,
      );
      window.removeEventListener(
        DASHBOARD_EVENTS.MARK_VIEWPORT_READ_START,
        handleViewportReadStart,
      );
      window.removeEventListener(
        DASHBOARD_EVENTS.MARK_ALL_READ_START,
        handleMarkAllReadStart,
      );
      scrollViewport.removeEventListener(
        DASHBOARD_EVENTS.ARTICLE_EXPAND_PREPARED,
        handleExpandPrepared,
      );
      scrollViewport.removeEventListener(
        DASHBOARD_EVENTS.ARTICLE_EXPAND_SETTLED,
        handleExpandSettled,
      );
      scrollViewport.removeEventListener(
        DASHBOARD_EVENTS.ARTICLE_COLLAPSE_SETTLED,
        handleCollapseSettled,
      );
    };
  }, [
    articleFilter,
    captureInvertedExpansionViewportSnapshot,
    claimInvertedScrollOwnership,
    prepareInvertedUnreadRemovalScrollLock,
    releaseInvertedExpansionScrollLock,
    scrollViewport,
    startInvertedExpansionScrollLock,
    syncInvertedExpansionScrollLock,
  ]);

  useEffect(() => {
    return () => {
      releaseInvertedExpansionScrollLock();
      clearInvertedExpansionViewportSnapshot();
    };
  }, [clearInvertedExpansionViewportSnapshot, releaseInvertedExpansionScrollLock]);

  useLayoutEffect(() => {
    if (!scrollViewport) {
      return;
    }

    const isInitialViewportResolution = !hasResolvedInitialViewportRef.current;
    const didFeedViewChange = previousFeedViewKeyRef.current !== feedViewKey;
    const didRefreshEpochChange = previousRefreshEpochRef.current !== refreshEpoch;
    const didInvertedChange = previousIsInvertedRef.current !== isInvertedScroll;
    hasResolvedInitialViewportRef.current = true;
    previousFeedViewKeyRef.current = feedViewKey;
    previousRefreshEpochRef.current = refreshEpoch;
    previousIsInvertedRef.current = isInvertedScroll;
    const isViewportReplacementDuringRestore =
      !didFeedViewChange && !didRefreshEpochChange && !didInvertedChange && isCollapseScrollRestoreActive;
    const shouldResetInitialViewportScroll =
      isInitialViewportResolution && !isCollapseScrollRestoreActive;

    if (isInvertedScroll) {
      /** Inverted scroll-to-bottom is driven by Virtuoso's totalListHeightChanged. */
      shouldLockNormalInitialScrollRef.current = false;
      return;
    }

    if (
      isViewportReplacementDuringRestore ||
      (
        scrollViewport.scrollTop === 0 &&
        !shouldResetInitialViewportScroll &&
        !didFeedViewChange &&
        !didRefreshEpochChange &&
        !didInvertedChange
      )
    ) {
      shouldLockNormalInitialScrollRef.current = false;
      return;
    }

    if (
      !didFeedViewChange &&
      !didRefreshEpochChange &&
      !didInvertedChange &&
      !shouldResetInitialViewportScroll
    ) {
      shouldLockNormalInitialScrollRef.current = false;
      return;
    }

    shouldLockNormalInitialScrollRef.current = true;
    scrollViewport.scrollTop = 0;
  }, [feedViewKey, isCollapseScrollRestoreActive, isInvertedScroll, refreshEpoch, scrollViewport]);

  /**
   * Keep inverted mode anchored to the newest article until the reader starts
   * interacting. Once the user scrolls upward for older content, Virtuoso's
   * native prepend preservation takes over and we stop forcing a bottom snap.
   */
  const getInvertedScrollIntoViewLocation = useCallback(
    ({ totalCount }: { scrollingInProgress: boolean; totalCount: number }) => {
      if (
        !isInvertedScrollRef.current ||
        expandedArticleKey !== null ||
        hasClaimedInvertedScrollOwnership ||
        totalCount === 0
      ) {
        return false;
      }

      return {
        align: "end" as const,
        behavior: "auto" as const,
        index: invertedScrollAnchorIndex,
      };
    },
    [expandedArticleKey, hasClaimedInvertedScrollOwnership, invertedScrollAnchorIndex],
  );

  /**
   * Continue following the newest item while inverted mode is still in its
   * initial reader-idle state. Once the reader scrolls, preserve position.
   */
  const getInvertedFollowOutput = useCallback(() => {
    if (
      !isInvertedScrollRef.current ||
      expandedArticleKey !== null ||
      hasClaimedInvertedScrollOwnership
    ) {
      return false;
    }

    return "auto" as const;
  }, [expandedArticleKey, hasClaimedInvertedScrollOwnership]);

  /** Reports whether inverted mode still owns the viewport anchor. */
  const shouldAutoAnchorInvertedScroll = useCallback(() => {
    return (
      isInvertedScrollRef.current &&
      expandedArticleKey === null &&
      !hasClaimedInvertedScrollOwnership
    );
  }, [expandedArticleKey, hasClaimedInvertedScrollOwnership]);

  /** Reports whether normal mode should keep locking the viewport to the top. */
  const shouldLockInitialNormalScroll = useCallback(() => {
    return shouldLockNormalInitialScrollRef.current && !isInvertedScrollRef.current;
  }, []);

  const expandVisibleWindow = useCallback(() => {
    setVisibleArticleCount((currentCount) => {
      if (currentCount >= filteredFeedLength) {
        return currentCount;
      }

      return Math.min(currentCount + articlesPerPage, filteredFeedLength);
    });
  }, [articlesPerPage, filteredFeedLength]);

  const maybeLoadNextPage = useCallback(() => {
    if (!scrollViewport || visibleArticleCount >= filteredFeedLength) {
      return;
    }

    if (!hasUserScrolledRef.current) {
      return;
    }

    if (isInvertedScroll) {
      /** When inverted, older content is above the viewport — load when near the top. */
      if (
        Number.isFinite(scrollViewport.scrollTop) &&
        scrollViewport.scrollTop <= FEED_LOAD_MORE_THRESHOLD_PX
      ) {
        expandVisibleWindow();
      }
    } else {
      const remainingDistance =
        scrollViewport.scrollHeight -
        (scrollViewport.scrollTop + scrollViewport.clientHeight);

      if (
        Number.isFinite(remainingDistance) &&
        remainingDistance <= FEED_LOAD_MORE_THRESHOLD_PX
      ) {
        expandVisibleWindow();
      }
    }
  }, [expandVisibleWindow, filteredFeedLength, isInvertedScroll, scrollViewport, visibleArticleCount]);

  const shouldUseVirtualizedFeed =
    !isInitialLoading &&
    scrollViewport !== null;

  /** Expands the current page only when the measured viewport still cannot scroll. */
  const maybeAutoFillViewport = useCallback(() => {
    if (
      !scrollViewport ||
      isInitialLoading ||
      visibleArticleCount >= filteredFeedLength
    ) {
      return;
    }

    const scrollableOverflowPx =
      scrollViewport.scrollHeight - scrollViewport.clientHeight;

    if (
      Number.isFinite(scrollableOverflowPx) &&
      scrollableOverflowPx <= FEED_MIN_SCROLLABLE_OVERFLOW_PX
    ) {
      expandVisibleWindow();
    }
  }, [expandVisibleWindow, filteredFeedLength, isInitialLoading, scrollViewport, visibleArticleCount]);

  useEffect(() => {
    if (
      !scrollViewport ||
      isInitialLoading ||
      visibleArticleCount >= filteredFeedLength
    ) {
      return;
    }

    let settledAutoFillFrameId: null | number = null;
    const autoFillFrameId = requestAnimationFrame(() => {
      if (shouldUseVirtualizedFeed && scrollViewport.scrollHeight <= 0) {
        settledAutoFillFrameId = requestAnimationFrame(() => {
          maybeAutoFillViewport();
        });
        return;
      }

      maybeAutoFillViewport();
    });

    return () => {
      cancelAnimationFrame(autoFillFrameId);
      if (settledAutoFillFrameId !== null) {
        cancelAnimationFrame(settledAutoFillFrameId);
      }
    };
  }, [filteredFeedLength, isInitialLoading, maybeAutoFillViewport, scrollViewport, shouldUseVirtualizedFeed, visibleArticleCount]);

  useEffect(() => {
    if (!scrollViewport) {
      return;
    }

    const handleScrollIntent = () => {
      if (invertedExpansionScrollLockRef.current) {
        releaseInvertedExpansionScrollLock();
      }

      if (!isInvertedScrollRef.current) {
        shouldLockNormalInitialScrollRef.current = false;
      } else {
        claimInvertedScrollOwnership();
      }

      hasUserScrolledRef.current = true;
      maybeLoadNextPage();
    };

    const handleViewportScroll = () => {
      if (invertedExpansionScrollLockRef.current) {
        syncInvertedExpansionScrollLock();
        return;
      }

      if (
        shouldLockNormalInitialScrollRef.current &&
        !isInvertedScrollRef.current
      ) {
        if (scrollViewport.scrollTop !== 0) {
          scrollViewport.scrollTop = 0;
          return;
        }

        return;
      }

      if (scrollViewport.scrollTop > 0 && !isInvertedScrollRef.current) {
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
    claimInvertedScrollOwnership,
    maybeLoadNextPage,
    releaseInvertedExpansionScrollLock,
    scrollViewport,
    syncInvertedExpansionScrollLock,
  ]);

  useEffect(() => {
    if (
      !scrollViewport ||
      typeof IntersectionObserver !== "function" ||
      visibleArticleCount >= filteredFeedLength
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

        if (scrollViewport.scrollTop > 0 && !isInvertedScrollRef.current) {
          hasUserScrolledRef.current = true;
        }

        maybeLoadNextPage();
      },
      {
        root: scrollViewport,
        rootMargin: isInvertedScroll
          ? `${FEED_LOAD_MORE_THRESHOLD_PX}px 0px 0px 0px`
          : `0px 0px ${FEED_LOAD_MORE_THRESHOLD_PX}px 0px`,
        threshold: 0,
      },
    );

    observer.observe(sentinel);

    return () => {
      observer.disconnect();
    };
  }, [filteredFeedLength, isInvertedScroll, maybeLoadNextPage, scrollViewport, visibleArticleCount]);

  const trimmedSearchTerm = searchTerm.trim();
  const hasSearchTerm = trimmedSearchTerm.length > 0;
  const hasMoreArticles = visibleArticleCount < filteredFeedLength;
  const shouldShowViewportResolutionSkeleton =
    !isInitialLoading && filteredFeedLength > 0 && viewportResolutionState === "pending";
  const showEmptyState = !isInitialLoading && filteredFeedLength === 0;

  const feedSurfaceMode: FeedSurfaceMode =
    isInitialLoading || shouldShowViewportResolutionSkeleton
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
        : "feed-content";

  const virtuosoComponents = useMemo(
    () => ({
      Footer: () =>
        hasMoreArticles ? (
          <div
            className="h-px w-full"
            data-feed-load-more-sentinel="true"
            ref={loadMoreSentinelRef}
          />
        ) : null,
      Item: forwardRef<HTMLDivElement, ComponentPropsWithRef<"div">>(
        function VirtuosoItem(props, ref) {
          return <div {...props} ref={ref} style={{ ...props.style, minHeight: 1 }} />;
        },
      ),
    }),
    [hasMoreArticles],
  );

  /**
   * Inverted variant that includes a `Header` sentinel (renders at the visual
   * top of the reversed list) plus the same `Item` wrapper. The `Footer` is
   * omitted because pagination expands upward via the header sentinel.
   */
  const invertedVirtuosoComponents = useMemo(
    () => ({
      Header: () =>
        hasMoreArticles ? (
          <div
            className="h-px w-full"
            data-feed-load-more-sentinel="true"
            ref={loadMoreSentinelRef}
          />
        ) : null,
      Item: forwardRef<HTMLDivElement, ComponentPropsWithRef<"div">>(
        function VirtuosoItem(props, ref) {
          return <div {...props} ref={ref} style={{ ...props.style, minHeight: 1 }} />;
        },
      ),
      List: forwardRef<HTMLDivElement, ComponentPropsWithRef<"div">>(
        function InvertedVirtuosoList(props, ref) {
          return (
            <div
              {...props}
              ref={ref}
              style={{
                ...props.style,
                paddingBottom: 0,
              }}
            />
          );
        },
      ),
    }),
    [hasMoreArticles],
  );

  return {
    contentKey,
    feedSurfaceMode,
    getInvertedFollowOutput,
    getInvertedScrollIntoViewLocation,
    handleViewportHostRef,
    hasMoreArticles,
    hasSearchTerm,
    invertedVirtuosoComponents,
    isInvertedScroll,
    loadMoreSentinelRef,
    maybeAutoFillViewport,
    scrollViewport,
    shouldAutoAnchorInvertedScroll,
    shouldLockInitialNormalScroll,
    shouldShowViewportResolutionSkeleton,
    shouldUseVirtualizedFeed,
    syncInvertedExpansionScrollLock,
    trimmedSearchTerm,
    virtuosoComponents,
    visibleArticleCount,
  };
}

function collectFullyVisibleArticleKeys(viewport: HTMLElement) {
  const viewportRect = viewport.getBoundingClientRect();

  return Array.from(
    viewport.querySelectorAll<HTMLElement>("article[data-article-key]"),
  )
    .filter((articleElement) => {
      const articleRect = articleElement.getBoundingClientRect();

      return (
        articleRect.top >= viewportRect.top &&
        articleRect.bottom <= viewportRect.bottom
      );
    })
    .map((articleElement) => articleElement.dataset.articleKey)
    .filter((articleKey): articleKey is string => Boolean(articleKey));
}

function findInvertedExpansionHeaderAnchor(articleKey: null | string) {
  if (!articleKey) {
    return null;
  }

  return document.querySelector<HTMLElement>(
    `article[data-article-key="${CSS.escape(articleKey)}"] [data-article-swipe-zone='header']`,
  );
}

function findInvertedExpansionLockAnchor(articleKey: null | string) {
  if (!articleKey) {
    return null;
  }

  return document.querySelector<HTMLElement>(
    `[data-scroll-restore-key="${CSS.escape(articleKey)}"], article[data-article-key="${CSS.escape(articleKey)}"]`,
  );
}

function findInvertedExpansionLockViewport() {
  const viewports = document.querySelectorAll<HTMLElement>(
    "[data-radix-scroll-area-viewport]",
  );

  return Array.from(viewports).find(isInvertedExpansionLockViewport) ?? null;
}

function getViewportOffsetTop(
  element: HTMLElement | null,
  viewport: HTMLElement,
) {
  if (!element) {
    return 0;
  }

  return element.getBoundingClientRect().top - viewport.getBoundingClientRect().top;
}

function isInvertedExpansionLockViewport(viewport: HTMLElement) {
  return Boolean(
    viewport.querySelector("[data-feed-virtualizer='true'], [data-scroll-restore-key]"),
  );
}

function observeInvertedExpansionScrollLockLayout({
  articleKey,
  onLayoutChange,
  viewport,
}: InvertedExpansionScrollLockObserverOptions) {
  const resizeObserver =
    typeof ResizeObserver === "undefined"
      ? null
      : new ResizeObserver(() => {
          onLayoutChange();
        });
  const mutationObserver =
    typeof MutationObserver === "undefined"
      ? null
      : new MutationObserver(() => {
          observeResizeTargets();
          onLayoutChange();
        });

  const observeResizeTarget = (target: Element | null) => {
    if (!resizeObserver || !target) {
      return;
    }

    resizeObserver.observe(target);
  };

  const observeResizeTargets = () => {
    resizeObserver?.disconnect();
    observeResizeTarget(viewport);
    observeResizeTarget(viewport.firstElementChild);
    observeResizeTarget(findInvertedExpansionHeaderAnchor(articleKey));
    observeResizeTarget(findInvertedExpansionLockAnchor(articleKey));
  };

  observeResizeTargets();
  mutationObserver?.observe(viewport, {
    childList: true,
    subtree: true,
  });

  return () => {
    resizeObserver?.disconnect();
    mutationObserver?.disconnect();
  };
}

function readPreparedArticleKey(event: Event) {
  if (!(event instanceof CustomEvent)) {
    return null;
  }

  const detail = event.detail as ArticleExpandPreparedDetail | null;

  return typeof detail?.articleKey === "string"
    ? detail.articleKey
    : null;
}

function resolveInvertedExpansionLockViewport(
  articleKey: null | string,
  viewport: HTMLElement,
) {
  const anchorViewport = findInvertedExpansionLockAnchor(articleKey)?.closest<HTMLElement>(
    "[data-radix-scroll-area-viewport]",
  );

  if (anchorViewport) {
    return anchorViewport;
  }

  if (isInvertedExpansionLockViewport(viewport)) {
    return viewport;
  }

  return findInvertedExpansionLockViewport();
}