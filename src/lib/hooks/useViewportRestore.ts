"use client";

import { useCallback } from "react";

import {
  applyViewportRef,
  captureViewportState,
  flushViewportState,
  invalidateViewportState,
  restoreViewportState,
  useViewportRestoreLifecycle,
  useViewportRestoreRefs,
} from "@/lib/hooks/viewportRestoreController";

interface UseViewportRestoreResult {
  capture: () => void;
  flush: () => void;
  invalidate: () => void;
  ref: (rootNode: HTMLElement | null) => void;
  settle: () => void;
}

/**
 * Manage the viewport restore.
 * @param sessionKey - The session key.
 * @param scrollOffset - The scroll offset value.
 * @returns The viewport restore state and callbacks.
 */
export function useViewportRestore(
  sessionKey: string,
  scrollOffset = 0,
): UseViewportRestoreResult {
  const refs = useViewportRestoreRefs(scrollOffset);

  const stopRestore = useCallback(() => {
    refs.pendingRef.current = null;
    refs.restoreUntilRef.current = 0;
  }, [refs]);

  const applyScrollTop = useCallback(
    (viewport: HTMLElement, nextTop: number) => {
      if (Math.abs(viewport.scrollTop - nextTop) <= 1) return;
      refs.applyingRef.current = true;
      viewport.scrollTop = nextTop;
      cancelAnimationFrame(refs.applyRafRef.current);
      refs.applyRafRef.current = requestAnimationFrame(() => {
        refs.applyingRef.current = false;
      });
    },
    [refs],
  );

  const restore = useCallback(() => {
    restoreViewportState(sessionKey, refs, applyScrollTop);
  }, [applyScrollTop, refs, sessionKey]);

  const attachRef = useCallback(
    (rootNode: HTMLElement | null) => {
      applyViewportRef(rootNode, sessionKey, refs, restore);
    },
    [refs, restore, sessionKey],
  );

  useViewportRestoreLifecycle({ refs, restore, sessionKey, stopRestore });

  const invalidate = useCallback(() => {
    invalidateViewportState(sessionKey, refs, stopRestore);
  }, [refs, sessionKey, stopRestore]);

  const capture = useCallback(() => {
    captureViewportState(sessionKey, refs, restore);
  }, [refs, restore, sessionKey]);

  const flush = useCallback(() => {
    flushViewportState(sessionKey, refs, restore);
  }, [refs, restore, sessionKey]);

  const settle = useCallback(() => {
    stopRestore();
  }, [stopRestore]);

  return { capture, flush, invalidate, ref: attachRef, settle };
}
