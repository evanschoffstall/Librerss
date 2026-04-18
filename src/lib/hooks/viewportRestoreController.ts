"use client";

import { useEffect, useRef } from "react";

import {
  bindViewportRestoreListeners,
  clearSavedScroll as clearSavedScrollInternal,
  observeViewportRestoreTargets,
  readSavedScroll as readSavedScrollInternal,
  type SavedScroll,
  type ViewportRestoreRefs,
  type WritableRef,
  writeSavedScroll as writeSavedScrollInternal,
} from "@/lib/hooks/viewportRestoreInternals";

export {
  clearSavedScrollInternal as clearSavedScroll,
  readSavedScrollInternal as readSavedScroll,
  type SavedScroll,
  type ViewportRestoreRefs,
  type WritableRef,
  writeSavedScrollInternal as writeSavedScroll,
};

const RESTORE_WINDOW_MS = 3000;

interface ObserveViewportRestoreOptions {
  refs: ViewportRestoreRefs;
  restore: () => void;
  sessionKey: string;
  stopRestore: () => void;
}

/**
 * @param rootNode
 * @param sessionKey
 * @param refs
 * @param restore
 */
export function applyViewportRef(
  rootNode: HTMLElement | null,
  sessionKey: string,
  refs: ViewportRestoreRefs,
  restore: () => void,
): void {
  refs.viewportRef.current =
    rootNode?.querySelector<HTMLElement>("[data-radix-scroll-area-viewport]") ??
    null;
  const viewport = refs.viewportRef.current;
  if (!viewport) {
    return;
  }

  const saved = readSavedScrollInternal(sessionKey);
  if (!saved || saved.t <= 0) {
    return;
  }

  refs.pendingRef.current = saved;
  refs.restoreUntilRef.current = Date.now() + RESTORE_WINDOW_MS;
  viewport.scrollTop = Math.max(refs.offsetRef.current, saved.t);
  requestAnimationFrame(restore);
}

/**
 * @param viewport
 * @param scrollOffset
 */
export function buildSavedScroll(
  viewport: HTMLElement,
  scrollOffset: number,
): null | SavedScroll {
  if (viewport.scrollTop < scrollOffset) return null;
  if (scrollOffset === 0 && viewport.scrollTop === 0) return null;

  const children = Array.from(viewport.firstElementChild?.children ?? []);
  const viewportTop = viewport.getBoundingClientRect().top;
  let ai = -1;
  let ao = 0;

  for (const [index, child] of children.entries()) {
    const top = child.getBoundingClientRect().top - viewportTop;
    if (top <= 1) {
      ai = index;
      ao = top;
      continue;
    }

    ai = index;
    ao = top;
    break;
  }

  if (ai === -1 && children.length > 0) {
    ai = children.length - 1;
    ao = children[ai].getBoundingClientRect().top - viewportTop;
  }

  return {
    ai,
    ao,
    k: ai >= 0 ? getScrollAnchorKey(children[ai]) : undefined,
    t: viewport.scrollTop,
  };
}

/**
 * @param sessionKey
 * @param refs
 * @param restore
 */
export function captureViewportState(
  sessionKey: string,
  refs: ViewportRestoreRefs,
  restore: () => void,
): void {
  const viewport = refs.viewportRef.current;
  if (!viewport) {
    return;
  }

  const saved = buildSavedScroll(viewport, refs.offsetRef.current);
  refs.pendingRef.current = saved;
  if (!saved) {
    clearSavedScrollInternal(sessionKey);
    return;
  }

  refs.restoreUntilRef.current = Date.now() + RESTORE_WINDOW_MS;
  writeSavedScrollInternal(sessionKey, saved);
  requestAnimationFrame(restore);
}

/**
 * @param viewport
 * @param target
 * @param scrollOffset
 */
export function clampScrollTop(
  viewport: HTMLElement,
  target: number,
  scrollOffset: number,
): null | number {
  const max = Math.max(0, viewport.scrollHeight - viewport.clientHeight);
  if (max === 0) return target >= scrollOffset ? scrollOffset : null;
  return Math.min(max, Math.max(scrollOffset, target));
}

/**
 * @param viewport
 * @param saved
 */
export function findSavedAnchor(viewport: HTMLElement, saved: SavedScroll) {
  const children = Array.from(viewport.firstElementChild?.children ?? []);
  if (saved.k) {
    const keyedChild = children.find(
      (child) => getScrollAnchorKey(child) === saved.k,
    );
    if (keyedChild) return keyedChild;
  }

  return children.at(saved.ai) ?? null;
}

/**
 * @param sessionKey
 * @param refs
 * @param restore
 */
export function flushViewportState(
  sessionKey: string,
  refs: ViewportRestoreRefs,
  restore: () => void,
): void {
  const saved = refs.pendingRef.current ?? readSavedScrollInternal(sessionKey);
  if (!saved) {
    return;
  }

  refs.pendingRef.current = saved;
  refs.restoreUntilRef.current = Date.now() + RESTORE_WINDOW_MS;
  restore();
  requestAnimationFrame(restore);
}

/**
 * @param element
 * @param viewport
 */
export function getElementOffset(element: Element, viewport: HTMLElement) {
  return (
    element.getBoundingClientRect().top -
    viewport.getBoundingClientRect().top +
    viewport.scrollTop
  );
}

/**
 * @param element
 */
export function getScrollAnchorKey(element: Element) {
  const ownKey = element.getAttribute("data-scroll-restore-key");
  if (ownKey) return ownKey;

  const nestedAnchor = element.querySelector(
    "[data-scroll-restore-key], [data-article-key]",
  );

  return (
    nestedAnchor?.getAttribute("data-scroll-restore-key") ??
    nestedAnchor?.getAttribute("data-article-key") ??
    undefined
  );
}

/**
 * @param sessionKey
 * @param refs
 * @param stopRestore
 */
export function invalidateViewportState(
  sessionKey: string,
  refs: ViewportRestoreRefs,
  stopRestore: () => void,
): void {
  cancelAnimationFrame(refs.saveRafRef.current);
  refs.saveRafRef.current = 0;
  stopRestore();
  clearSavedScrollInternal(sessionKey);
  if (refs.viewportRef.current) {
    refs.viewportRef.current.scrollTop = refs.offsetRef.current;
  }
}

/**
 * @param sessionKey
 * @param refs
 * @param applyScrollTop
 */
export function restoreViewportState(
  sessionKey: string,
  refs: ViewportRestoreRefs,
  applyScrollTop: (viewport: HTMLElement, nextTop: number) => void,
): void {
  const viewport = refs.viewportRef.current;
  if (!viewport) {
    return;
  }

  if (Date.now() > refs.restoreUntilRef.current) {
    refs.pendingRef.current = null;
    return;
  }

  const saved = refs.pendingRef.current ?? readSavedScrollInternal(sessionKey);
  if (!saved) {
    return;
  }

  refs.pendingRef.current = saved;
  const anchor = findSavedAnchor(viewport, saved);
  const targetTop = anchor
    ? getElementOffset(anchor, viewport) - saved.ao
    : saved.t;
  const nextTop = clampScrollTop(viewport, targetTop, refs.offsetRef.current);
  if (nextTop !== null) {
    applyScrollTop(viewport, nextTop);
  }
}

/**
 * @param root0
 * @param root0.refs
 * @param root0.restore
 * @param root0.sessionKey
 * @param root0.stopRestore
 */
export function useViewportRestoreLifecycle({
  refs,
  restore,
  sessionKey,
  stopRestore,
}: ObserveViewportRestoreOptions): void {
  useEffect(() => {
    const viewport = refs.viewportRef.current;
    if (!viewport) {
      return;
    }

    restore();
    const cleanupObservers = observeViewportRestoreTargets(viewport, restore);
    const cleanupListeners = bindViewportRestoreListeners(
      viewport,
      sessionKey,
      refs,
      stopRestore,
      buildSavedScroll,
    );

    return () => {
      cleanupListeners();
      cleanupObservers();
      cancelAnimationFrame(refs.applyRafRef.current);
      refs.applyingRef.current = false;
    };
  }, [refs, restore, sessionKey, stopRestore]);
}

/**
 * @param scrollOffset
 */
export function useViewportRestoreRefs(
  scrollOffset: number,
): ViewportRestoreRefs {
  const viewportRef = useRef<HTMLElement | null>(null);
  const saveRafRef = useRef(0);
  const applyRafRef = useRef(0);
  const pendingRef = useRef<null | SavedScroll>(null);
  const restoreUntilRef = useRef(0);
  const applyingRef = useRef(false);
  const offsetRef = useRef(scrollOffset);
  offsetRef.current = scrollOffset;

  return {
    applyingRef,
    applyRafRef,
    offsetRef,
    pendingRef,
    restoreUntilRef,
    saveRafRef,
    viewportRef,
  };
}
