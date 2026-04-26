import { useCallback, useMemo, useRef } from "react";

import {
  findInvertedExpansionHeaderAnchor,
  getViewportOffsetTop,
  type InvertedExpansionScrollLockMode,
  type InvertedExpansionScrollLockState,
  type InvertedExpansionViewportSnapshot,
  observeInvertedExpansionScrollLockLayout,
  resolveInvertedExpansionLockViewport,
} from "@/app/dashboard/dashboard-components/feed-view/feed-list-surface-state/view-core";

/**
 * Describes the options for expansion lock release deadline.
 */
interface ExpansionLockReleaseDeadlineOptions {
  lockState: InvertedExpansionScrollLockState;
  releaseInvertedExpansionScrollLock: () => void;
  syncInvertedExpansionScrollLock: () => void;
}

/**
 * Describes the options for expansion lock sync.
 */
interface ExpansionLockSyncOptions {
  invertedExpansionScrollLockRef: React.RefObject<InvertedExpansionScrollLockState | null>;
  lockState: InvertedExpansionScrollLockState;
  releaseInvertedExpansionScrollLock: () => void;
  syncInvertedExpansionScrollLock: () => void;
}

/**
 * Describes the options for release lock.
 */
interface ReleaseLockOptions {
  expandedArticleKeyRef: React.RefObject<null | string>;
  invertedExpansionScrollLockRef: React.RefObject<InvertedExpansionScrollLockState | null>;
  isInvertedScrollRef: React.RefObject<boolean>;
}

/**
 * Describes the options for start lock.
 */
interface StartLockOptions {
  invertedExpansionScrollLockRef: React.RefObject<InvertedExpansionScrollLockState | null>;
  scrollViewport: HTMLElement | null;
  syncInvertedExpansionScrollLock: () => void;
}

/**
 * Describes the options for use inverted expansion lock machine.
 */
interface UseInvertedExpansionLockMachineOptions {
  expandedArticleKeyRef: React.RefObject<null | string>;
  isInvertedScrollRef: React.RefObject<boolean>;
  scrollViewport: HTMLElement | null;
}

/**
 * Manage the inverted expansion lock machine.
 * @param options - The options used to manage the inverted expansion lock machine.
 * @returns The inverted expansion lock machine state and callbacks.
 */
export function useInvertedExpansionLockMachine(
  options: UseInvertedExpansionLockMachineOptions,
) {
  const { expandedArticleKeyRef, isInvertedScrollRef, scrollViewport } =
    options;
  const invertedExpansionScrollLockRef =
    useRef<InvertedExpansionScrollLockState | null>(null);

  const releaseInvertedExpansionScrollLock = useMemo(
    () =>
      createReleaseInvertedExpansionScrollLock({
        expandedArticleKeyRef,
        invertedExpansionScrollLockRef,
        isInvertedScrollRef,
      }),
    [expandedArticleKeyRef, isInvertedScrollRef],
  );

  const syncInvertedExpansionScrollLock = useCallback(() => {
    const lockState = invertedExpansionScrollLockRef.current;

    if (!lockState) {
      return;
    }

    if (!lockState.viewport.isConnected) {
      releaseInvertedExpansionScrollLock();
      return;
    }

    if (
      !rebindExpansionLockViewport(lockState, syncInvertedExpansionScrollLock)
    ) {
      releaseInvertedExpansionScrollLock();
      return;
    }

    syncResolvedExpansionLock({
      invertedExpansionScrollLockRef,
      lockState,
      releaseInvertedExpansionScrollLock,
      syncInvertedExpansionScrollLock,
    });
  }, [releaseInvertedExpansionScrollLock]);

  const startInvertedExpansionScrollLock = useMemo(
    () =>
      createStartInvertedExpansionScrollLock({
        invertedExpansionScrollLockRef,
        scrollViewport,
        syncInvertedExpansionScrollLock,
      }),
    [scrollViewport, syncInvertedExpansionScrollLock],
  );

  return {
    invertedExpansionScrollLockRef,
    releaseInvertedExpansionScrollLock,
    startInvertedExpansionScrollLock,
    syncInvertedExpansionScrollLock,
  };
}

/**
 * Create the release inverted expansion scroll lock.
 * @param options - The options used to create the release inverted expansion scroll lock.
 * @returns The release inverted expansion scroll lock.
 */
function createReleaseInvertedExpansionScrollLock(options: ReleaseLockOptions) {
  const {
    expandedArticleKeyRef,
    invertedExpansionScrollLockRef,
    isInvertedScrollRef,
  } = options;
  return () => {
    const lockState = invertedExpansionScrollLockRef.current;

    if (!lockState) {
      return;
    }

    disposeExpansionLock(
      lockState,
      isInvertedScrollRef.current && expandedArticleKeyRef.current !== null,
    );
    invertedExpansionScrollLockRef.current = null;
  };
}

/**
 * Create the start inverted expansion scroll lock.
 * @param options - The options used to create the start inverted expansion scroll lock.
 * @returns The start inverted expansion scroll lock.
 */
function createStartInvertedExpansionScrollLock(options: StartLockOptions) {
  const {
    invertedExpansionScrollLockRef,
    scrollViewport,
    syncInvertedExpansionScrollLock,
  } = options;
  return (
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
      disposeExpansionLock(existingLockState, false);
    }

    const snapshotViewport =
      snapshot?.viewport.isConnected === true ? snapshot.viewport : null;
    const resolvedViewport =
      snapshotViewport ??
      resolveInvertedExpansionLockViewport(articleKey, scrollViewport) ??
      scrollViewport;
    const baselineScrollTop = resolveBaselineScrollTop(
      existingLockState,
      resolvedViewport,
      snapshot,
    );
    const anchorViewportOffsetTop = resolveAnchorViewportOffsetTop(
      articleKey,
      existingLockState,
      resolvedViewport,
      snapshot,
    );

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
      pinToBottom: articleKey === null && mode === "stable",
      releaseAt: releaseAt ?? null,
      viewport: resolvedViewport,
      viewportOverflowAnchor:
        existingLockState?.viewport === resolvedViewport
          ? existingLockState.viewportOverflowAnchor
          : resolvedViewport.style.overflowAnchor,
    };

    resolvedViewport.style.overflowAnchor = "none";
    syncInvertedExpansionScrollLock();
  };
}

/**
 * Process the dispose expansion lock.
 * @param lockState - The lock state.
 * @param shouldKeepOverflowAnchorDisabled - Whether should keep overflow anchor disabled.
 */
function disposeExpansionLock(
  lockState: InvertedExpansionScrollLockState,
  shouldKeepOverflowAnchorDisabled: boolean,
) {
  lockState.disconnectLayoutObservers?.();

  if (lockState.animationFrameId !== 0) {
    window.cancelAnimationFrame(lockState.animationFrameId);
  }

  if (lockState.viewport.isConnected) {
    lockState.viewport.style.overflowAnchor = shouldKeepOverflowAnchorDisabled
      ? "none"
      : lockState.viewportOverflowAnchor;
  }
}

/**
 * Handle release-deadline scheduling for the current lock and report whether it consumed the sync.
 * @param options - The active lock state together with the release and resync callbacks.
 * @param targetScrollTop - The scroll position the current lock pass is targeting.
 * @param invertedExpansionScrollLockRef - Tracks the active lock state for rescheduling.
 * @returns Whether deadline handling fully consumed the current sync pass.
 */
function handleExpansionLockReleaseDeadline(
  options: ExpansionLockReleaseDeadlineOptions,
  targetScrollTop: number,
  invertedExpansionScrollLockRef: React.RefObject<InvertedExpansionScrollLockState | null>,
) {
  if (options.lockState.releaseAt === null) {
    return false;
  }

  if (performance.now() >= options.lockState.releaseAt) {
    if (shouldReleaseExpansionLock(options.lockState, targetScrollTop)) {
      options.releaseInvertedExpansionScrollLock();
      return true;
    }

    scheduleExpansionLockSync(
      invertedExpansionScrollLockRef,
      options.syncInvertedExpansionScrollLock,
    );
    return true;
  }

  scheduleExpansionLockSync(
    invertedExpansionScrollLockRef,
    options.syncInvertedExpansionScrollLock,
  );
  return true;
}

/**
 * Process the rebind expansion lock viewport.
 * @param lockState - The lock state.
 * @param syncInvertedExpansionScrollLock - The callback that sync inverted expansion scroll lock.
 * @returns The rebind expansion lock viewport.
 */
function rebindExpansionLockViewport(
  lockState: InvertedExpansionScrollLockState,
  syncInvertedExpansionScrollLock: () => void,
) {
  const currentAnchor = findInvertedExpansionHeaderAnchor(
    lockState.articleKey,
    lockState.viewport,
  );
  const currentAnchorViewportOffsetTop = currentAnchor
    ? getViewportOffsetTop(currentAnchor, lockState.viewport)
    : lockState.anchorViewportOffsetTop;
  const resolvedViewport = resolveInvertedExpansionLockViewport(
    lockState.articleKey,
    lockState.viewport,
  );

  if (!resolvedViewport) {
    return null;
  }

  if (resolvedViewport === lockState.viewport) {
    return resolvedViewport;
  }

  lockState.disconnectLayoutObservers?.();
  lockState.viewport.style.overflowAnchor = lockState.viewportOverflowAnchor;
  lockState.viewport = resolvedViewport;
  lockState.viewportOverflowAnchor = resolvedViewport.style.overflowAnchor;
  lockState.disconnectLayoutObservers =
    observeInvertedExpansionScrollLockLayout({
      articleKey: lockState.articleKey,
      onLayoutChange: syncInvertedExpansionScrollLock,
      viewport: resolvedViewport,
    });
  if (lockState.mode === "expand" || lockState.mode === "stable") {
    lockState.anchorViewportOffsetTop = currentAnchorViewportOffsetTop;
  }
  resolvedViewport.style.overflowAnchor = "none";

  return resolvedViewport;
}

/**
 * Resolve the viewport offset that the expansion lock should preserve.
 * @param articleKey - The article key that owns the expansion lock.
 * @param existingLockState - The current lock state before rebinding.
 * @param resolvedViewport - The viewport that will own the new lock.
 * @param snapshot - The captured expansion snapshot, when one exists.
 * @returns The viewport offset the lock should maintain for the anchor header.
 */
function resolveAnchorViewportOffsetTop(
  articleKey: null | string,
  existingLockState: InvertedExpansionScrollLockState | null,
  resolvedViewport: HTMLElement,
  snapshot: InvertedExpansionViewportSnapshot | null | undefined,
) {
  if (snapshot) {
    return snapshot.articleHeaderViewportOffsetTop;
  }

  if (
    existingLockState?.viewport === resolvedViewport &&
    existingLockState.articleKey === articleKey
  ) {
    return existingLockState.anchorViewportOffsetTop;
  }

  return getViewportOffsetTop(
    findInvertedExpansionHeaderAnchor(articleKey, resolvedViewport),
    resolvedViewport,
  );
}

/**
 * Resolve the baseline scroll position to restore while the lock is active.
 * @param existingLockState - The current lock state before rebinding.
 * @param resolvedViewport - The viewport that will own the new lock.
 * @param snapshot - The captured expansion snapshot, when one exists.
 * @returns The baseline scroll top for the lock lifecycle.
 */
function resolveBaselineScrollTop(
  existingLockState: InvertedExpansionScrollLockState | null,
  resolvedViewport: HTMLElement,
  snapshot: InvertedExpansionViewportSnapshot | null | undefined,
) {
  if (snapshot) {
    return snapshot.viewportScrollTop;
  }

  return existingLockState?.viewport === resolvedViewport
    ? existingLockState.baselineScrollTop
    : resolvedViewport.scrollTop;
}

/**
 * Resolve the lock target scroll top.
 * @param lockState - The lock state.
 * @returns The lock target scroll top.
 */
function resolveLockTargetScrollTop(
  lockState: InvertedExpansionScrollLockState,
) {
  if (
    lockState.articleKey !== null &&
    (lockState.mode === "collapsing" || lockState.mode === "restore")
  ) {
    return lockState.baselineScrollTop;
  }

  const anchor = findInvertedExpansionHeaderAnchor(
    lockState.articleKey,
    lockState.viewport,
  );
  const anchoredScrollTop = anchor
    ? lockState.viewport.scrollTop +
      getViewportOffsetTop(anchor, lockState.viewport) -
      lockState.anchorViewportOffsetTop
    : null;

  return (
    anchoredScrollTop ??
    (lockState.pinToBottom
      ? Math.max(
          0,
          lockState.viewport.scrollHeight - lockState.viewport.clientHeight,
        )
      : lockState.baselineScrollTop)
  );
}

/**
 * Process the schedule expansion lock sync.
 * @param invertedExpansionScrollLockRef - The ref that stores the inverted expansion scroll lock ref.
 * @param syncInvertedExpansionScrollLock - The callback that sync inverted expansion scroll lock.
 */
function scheduleExpansionLockSync(
  invertedExpansionScrollLockRef: React.RefObject<InvertedExpansionScrollLockState | null>,
  syncInvertedExpansionScrollLock: () => void,
) {
  const lockState = invertedExpansionScrollLockRef.current;

  if (lockState?.animationFrameId !== 0) {
    return;
  }

  lockState.animationFrameId = window.requestAnimationFrame(() => {
    if (invertedExpansionScrollLockRef.current) {
      invertedExpansionScrollLockRef.current.animationFrameId = 0;
    }

    syncInvertedExpansionScrollLock();
  });
}

/**
 * Return whether the release deadline can safely hand control back to the feed.
 * In restore mode, keep the lock alive until the article header has actually
 * returned to its captured viewport offset.
 * @param lockState - The active expansion lock state being evaluated.
 * @param targetScrollTop - The scroll position the current lock pass is targeting.
 * @returns Whether the current lock can safely release control back to pagination.
 */
function shouldReleaseExpansionLock(
  lockState: InvertedExpansionScrollLockState,
  targetScrollTop: number,
) {
  if (lockState.mode !== "restore") {
    return true;
  }

  const anchor = findInvertedExpansionHeaderAnchor(
    lockState.articleKey,
    lockState.viewport,
  );

  if (!anchor) {
    return false;
  }

  return (
    Math.abs(lockState.viewport.scrollTop - targetScrollTop) <= 1 &&
    Math.abs(
      getViewportOffsetTop(anchor, lockState.viewport) -
        lockState.anchorViewportOffsetTop,
    ) <= 1
  );
}

/**
 * Return whether should schedule persistent expansion lock.
 * @param lockState - The lock state.
 * @returns Whether should schedule persistent expansion lock.
 */
function shouldSchedulePersistentExpansionLock(
  lockState: InvertedExpansionScrollLockState,
) {
  return (
    lockState.releaseAt === null &&
    (lockState.mode === "expand" || lockState.mode === "collapsing")
  );
}

/**
 * Apply the resolved lock state to the viewport and schedule any follow-up sync work.
 * @param options - The active lock state together with the release and resync callbacks.
 */
function syncResolvedExpansionLock(options: ExpansionLockSyncOptions) {
  const targetScrollTop = resolveLockTargetScrollTop(options.lockState);

  if (Math.abs(options.lockState.viewport.scrollTop - targetScrollTop) > 0.5) {
    options.lockState.viewport.scrollTop = targetScrollTop;
  }

  if (
    handleExpansionLockReleaseDeadline(
      options,
      targetScrollTop,
      options.invertedExpansionScrollLockRef,
    )
  ) {
    return;
  }

  if (shouldSchedulePersistentExpansionLock(options.lockState)) {
    scheduleExpansionLockSync(
      options.invertedExpansionScrollLockRef,
      options.syncInvertedExpansionScrollLock,
    );
  }
}
