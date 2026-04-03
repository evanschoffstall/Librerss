import { useCallback, useEffect, useLayoutEffect, useRef } from "react";

import { DASHBOARD_EVENTS } from "../../../constants";
import {
  ARTICLE_DEEXPAND_REMOVAL_ANIMATION_MS,
  ARTICLE_REMOVAL_ANIMATION_MS,
  ARTICLE_SCROLL_RESTORE_BUFFER_MS,
  type ArticleViewportSnapshot,
  type CollapsingArticles,
} from "../../../hooks/useArticleCollapseState";
import {
  collectFullyVisibleArticleKeys,
  findInvertedExpansionHeaderAnchor,
  findInvertedExpansionLockAnchor,
  findVisibleInvertedRemovalAnchorArticleKey,
  getViewportOffsetTop,
  observeInvertedExpansionScrollLockLayout,
  readPreparedArticleKey,
  resolveInvertedExpansionLockViewport,
} from "./dom";
import {
  type InvertedExpansionScrollLockMode,
  type InvertedExpansionScrollLockState,
  type InvertedExpansionViewportSnapshot,
  type PrimedUnreadRemovalState,
} from "./types";

interface UseInvertedExpansionScrollLockOptions {
  articleFilter: string;
  collapsingArticles: Readonly<CollapsingArticles>;
  expandedArticleKey: null | string;
  getPreExpandViewportSnapshot: (articleKey: string) => ArticleViewportSnapshot | null;
  isInvertedScroll: boolean;
  onClaimInvertedScrollOwnership: () => void;
  scrollViewport: HTMLElement | null;
}

/**
 * Preserves article position while inverted feeds expand, collapse, or remove rows.
 *
 * The feed surface relies on a transient scroll lock during layout-changing row
 * transitions so the active article does not visually jump when the underlying
 * Radix viewport recalculates its height.
 */
export function useInvertedExpansionScrollLock({
  articleFilter,
  collapsingArticles,
  expandedArticleKey,
  getPreExpandViewportSnapshot,
  isInvertedScroll,
  onClaimInvertedScrollOwnership,
  scrollViewport,
}: UseInvertedExpansionScrollLockOptions) {
  const invertedExpansionScrollLockRef =
    useRef<InvertedExpansionScrollLockState | null>(null);
  const invertedExpansionViewportSnapshotRef =
    useRef<InvertedExpansionViewportSnapshot | null>(null);
  const isInvertedScrollRef = useRef(isInvertedScroll);
  const expandedArticleKeyRef = useRef(expandedArticleKey);
  const previousExpandedArticleKeyRef = useRef(expandedArticleKey);
  const previousCollapsingArticleKeysRef = useRef<string[]>([]);
  const primedUnreadRemovalRef = useRef<null | PrimedUnreadRemovalState>(null);

  isInvertedScrollRef.current = isInvertedScroll;
  expandedArticleKeyRef.current = expandedArticleKey;

  /** Releases the active lock and restores the viewport's overflow-anchor state. */
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

  /** Clears any cached pre-expansion snapshot once the owning lifecycle ends. */
  const clearInvertedExpansionViewportSnapshot = useCallback(() => {
    invertedExpansionViewportSnapshotRef.current = null;
  }, []);

  /** Captures the viewport and header position before a row changes height. */
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

  /** Reapplies the scroll lock after layout changes or viewport replacement. */
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
      lockState.disconnectLayoutObservers = observeInvertedExpansionScrollLockLayout({
        articleKey: lockState.articleKey,
        onLayoutChange: syncInvertedExpansionScrollLock,
        viewport: resolvedViewport,
      });
      resolvedViewport.style.overflowAnchor = "none";
    }

    const anchor = findInvertedExpansionHeaderAnchor(lockState.articleKey);
    const anchoredScrollTop = anchor
      ? lockState.viewport.scrollTop +
        getViewportOffsetTop(anchor, lockState.viewport) -
        lockState.anchorViewportOffsetTop
      : null;
    const targetScrollTop = anchoredScrollTop ??
      (lockState.pinToBottom
        ? Math.max(0, lockState.viewport.scrollHeight - lockState.viewport.clientHeight)
        : lockState.baselineScrollTop);

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

  /** Starts or refreshes the scroll lock for the supplied article transition. */
  const startInvertedExpansionScrollLock = useCallback((
    articleKey: null | string,
    snapshot: InvertedExpansionViewportSnapshot | null | undefined,
    mode: InvertedExpansionScrollLockMode,
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

      // Inherit pinToBottom when the new lock replaces an all-collapsed lock
      // mid-flight (e.g. the survivor path fires immediately after). Without
      // this, a quick second lock would forget the intent and revert to baseline.
      if (existingLockState.pinToBottom && articleKey === null && mode === "stable") {
        // keep pinToBottom; handled at write time below
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
      // Pin to bottom when there is no anchor article — this means all visible
      // articles were collapsed at once (mark-visible-as-read). Backfill loads
      // prepend older articles above, raising scrollHeight. A fixed baseline
      // would leave the user just below the new bottom; dynamic maxScrollTop
      // tracking keeps them anchored to the newest remaining articles.
      pinToBottom: articleKey === null && mode === "stable",
      releaseAt: releaseAt ?? null,
      viewport: resolvedViewport,
      viewportOverflowAnchor,
    };

    resolvedViewport.style.overflowAnchor = "none";
    syncInvertedExpansionScrollLock();
  }, [scrollViewport, syncInvertedExpansionScrollLock]);

  /** Prepares a stable survivor row to anchor unread-removal compensation. */
  const prepareInvertedUnreadRemovalScrollLock = useCallback((
    excludedArticleKeys: Iterable<string>,
    options?: { primeInteraction?: boolean },
  ) => {
    if (!isInvertedScrollRef.current) {
      return;
    }

    onClaimInvertedScrollOwnership();
    const excludedArticleKeySet = new Set(excludedArticleKeys);

    const anchorArticleKey = findVisibleInvertedRemovalAnchorArticleKey(
      excludedArticleKeySet,
    );

    const releaseAt =
      performance.now() +
      ARTICLE_REMOVAL_ANIMATION_MS +
      ARTICLE_SCROLL_RESTORE_BUFFER_MS;

    if (!anchorArticleKey) {
      // Every visible article is being collapsed — no survivor to anchor to.
      // Use a longer lock window so the pinToBottom rAF loop stays active long
      // enough to compensate for server-backfill prepends. The base buffer is
      // too short for typical server round-trips; 5 s covers slow connections
      // and still releases promptly when the user interacts (touchmove/wheel
      // releases the lock immediately).
      const pinToBottomReleaseAt =
        performance.now() + ARTICLE_REMOVAL_ANIMATION_MS + 5_000;

      if (options?.primeInteraction) {
        primedUnreadRemovalRef.current = {
          articleKeys: excludedArticleKeySet,
          expiresAt: pinToBottomReleaseAt,
        };
      }
      startInvertedExpansionScrollLock(null, null, "stable", pinToBottomReleaseAt);
      return;
    }

    const snapshot = captureInvertedExpansionViewportSnapshot(anchorArticleKey);

    if (!snapshot) {
      return;
    }

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
    onClaimInvertedScrollOwnership,
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

    onClaimInvertedScrollOwnership();

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
    expandedArticleKey,
    isInvertedScroll,
    onClaimInvertedScrollOwnership,
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

      onClaimInvertedScrollOwnership();
    };

    const handleArticleReadToggleStart = (event: Event) => {
      if (!isInvertedScrollRef.current || articleFilter !== "unread") {
        return;
      }

      const articleKey = readPreparedArticleKey(event);

      if (!articleKey) {
        onClaimInvertedScrollOwnership();
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

      onClaimInvertedScrollOwnership();

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
    onClaimInvertedScrollOwnership,
    prepareInvertedUnreadRemovalScrollLock,
    scrollViewport,
    startInvertedExpansionScrollLock,
    syncInvertedExpansionScrollLock,
  ]);

  useEffect(() => {
    return () => {
      releaseInvertedExpansionScrollLock();
      clearInvertedExpansionViewportSnapshot();
    };
  }, [
    clearInvertedExpansionViewportSnapshot,
    releaseInvertedExpansionScrollLock,
  ]);

  /** Reports whether the scroll lock currently owns the viewport. */
  const hasActiveInvertedExpansionScrollLock = useCallback(() => {
    return invertedExpansionScrollLockRef.current !== null;
  }, []);

  return {
    hasActiveInvertedExpansionScrollLock,
    releaseInvertedExpansionScrollLock,
    syncInvertedExpansionScrollLock,
  };
}