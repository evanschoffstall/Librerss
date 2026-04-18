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

interface ReleaseLockOptions {
  expandedArticleKeyRef: React.RefObject<null | string>;
  invertedExpansionScrollLockRef: React.RefObject<InvertedExpansionScrollLockState | null>;
  isInvertedScrollRef: React.RefObject<boolean>;
}

interface StartLockOptions {
  invertedExpansionScrollLockRef: React.RefObject<InvertedExpansionScrollLockState | null>;
  scrollViewport: HTMLElement | null;
  syncInvertedExpansionScrollLock: () => void;
}

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

    const targetScrollTop = resolveLockTargetScrollTop(lockState);

    if (Math.abs(lockState.viewport.scrollTop - targetScrollTop) > 0.5) {
      lockState.viewport.scrollTop = targetScrollTop;
    }

    if (lockState.releaseAt !== null) {
      if (performance.now() >= lockState.releaseAt) {
        releaseInvertedExpansionScrollLock();
        return;
      }

      scheduleExpansionLockSync(
        invertedExpansionScrollLockRef,
        syncInvertedExpansionScrollLock,
      );
    }

    if (shouldSchedulePersistentExpansionLock(lockState)) {
      scheduleExpansionLockSync(
        invertedExpansionScrollLockRef,
        syncInvertedExpansionScrollLock,
      );
    }
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

    const resolvedViewport =
      resolveInvertedExpansionLockViewport(articleKey, scrollViewport) ??
      scrollViewport;
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
 * Process the rebind expansion lock viewport.
 * @param lockState - The lock state.
 * @param syncInvertedExpansionScrollLock - The callback that sync inverted expansion scroll lock.
 * @returns The rebind expansion lock viewport.
 */
function rebindExpansionLockViewport(
  lockState: InvertedExpansionScrollLockState,
  syncInvertedExpansionScrollLock: () => void,
) {
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
  resolvedViewport.style.overflowAnchor = "none";

  return resolvedViewport;
}

/**
 * Resolve the lock target scroll top.
 * @param lockState - The lock state.
 * @returns The lock target scroll top.
 */
function resolveLockTargetScrollTop(
  lockState: InvertedExpansionScrollLockState,
) {
  const anchor = findInvertedExpansionHeaderAnchor(lockState.articleKey);
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
