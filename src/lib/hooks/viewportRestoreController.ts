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

/**
 * Describes the options for observe viewport restore.
 */
interface ObserveViewportRestoreOptions {
  refs: ViewportRestoreRefs;
  restore: () => void;
  sessionKey: string;
  stopRestore: () => void;
}

/**
 * Process the apply viewport ref.
 * @param rootNode - The root node.
 * @param sessionKey - The session key.
 * @param refs - The refs.
 * @param restore - The callback that restore.
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
 * Build the saved scroll.
 * @param viewport - The viewport.
 * @param scrollOffset - The scroll offset value.
 * @returns The saved scroll.
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
 * Process the capture viewport state.
 * @param sessionKey - The session key.
 * @param refs - The refs.
 * @param restore - The callback that restore.
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
 * Process the clamp scroll top.
 * @param viewport - The viewport.
 * @param target - The target.
 * @param scrollOffset - The scroll offset value.
 * @returns The clamp scroll top.
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
 * Process the find saved anchor.
 * @param viewport - The viewport.
 * @param saved - The saved.
 * @returns The find saved anchor.
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
 * Process the flush viewport state.
 * @param sessionKey - The session key.
 * @param refs - The refs.
 * @param restore - The callback that restore.
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
 * Return the element offset.
 * @param element - The element.
 * @param viewport - The viewport.
 * @returns The element offset.
 */
export function getElementOffset(element: Element, viewport: HTMLElement) {
  return (
    element.getBoundingClientRect().top -
    viewport.getBoundingClientRect().top +
    viewport.scrollTop
  );
}

/**
 * Return the scroll anchor key.
 * @param element - The element.
 * @returns The scroll anchor key.
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
 * Process the invalidate viewport state.
 * @param sessionKey - The session key.
 * @param refs - The refs.
 * @param stopRestore - The callback that stop restore.
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
 * Process the restore viewport state.
 * @param sessionKey - The session key.
 * @param refs - The refs.
 * @param applyScrollTop - The callback that apply scroll top.
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
 * Manage the viewport restore lifecycle.
 * @param options - The options used to manage the viewport restore lifecycle.
 */
export function useViewportRestoreLifecycle(
  options: ObserveViewportRestoreOptions,
): void {
  const { refs, restore, sessionKey, stopRestore } = options;
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
 * Manage the viewport restore refs.
 * @param scrollOffset - The scroll offset value.
 * @returns The viewport restore refs state and callbacks.
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
