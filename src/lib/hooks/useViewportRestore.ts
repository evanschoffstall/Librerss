"use client";

import { useCallback, useEffect, useRef } from "react";

const RESTORE_WINDOW_MS = 3000;

interface SavedScroll {
  ai: number;
  ao: number;
  k?: string;
  t: number;
}

interface UseViewportRestoreResult {
  capture: () => void;
  flush: () => void;
  invalidate: () => void;
  ref: (rootNode: HTMLElement | null) => void;
  settle: () => void;
}

export function useViewportRestore(
  sessionKey: string,
  scrollOffset = 0,
): UseViewportRestoreResult {
  const viewportRef = useRef<HTMLElement | null>(null);
  const saveRafRef = useRef(0);
  const applyRafRef = useRef(0);
  const pendingRef = useRef<null | SavedScroll>(null);
  const restoreUntilRef = useRef(0);
  const applyingRef = useRef(false);
  const offsetRef = useRef(scrollOffset);
  offsetRef.current = scrollOffset;

  const stopRestore = useCallback(() => {
    pendingRef.current = null;
    restoreUntilRef.current = 0;
  }, []);

  const applyScrollTop = useCallback(
    (viewport: HTMLElement, nextTop: number) => {
      if (Math.abs(viewport.scrollTop - nextTop) <= 1) return;
      applyingRef.current = true;
      viewport.scrollTop = nextTop;
      cancelAnimationFrame(applyRafRef.current);
      applyRafRef.current = requestAnimationFrame(() => {
        applyingRef.current = false;
      });
    },
    [],
  );

  const restore = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    if (Date.now() > restoreUntilRef.current) {
      pendingRef.current = null;
      return;
    }

    const saved = pendingRef.current ?? readSavedScroll(sessionKey);
    if (!saved) return;
    pendingRef.current = saved;

    const anchor = findSavedAnchor(viewport, saved);
    const nextTop = clampScrollTop(
      viewport,
      anchor ? getElementOffset(anchor, viewport) - saved.ao : saved.t,
      offsetRef.current,
    );
    if (nextTop !== null) applyScrollTop(viewport, nextTop);
  }, [applyScrollTop, sessionKey]);

  const attachRef = useCallback(
    (rootNode: HTMLElement | null) => {
      viewportRef.current =
        rootNode?.querySelector<HTMLElement>(
          "[data-radix-scroll-area-viewport]",
        ) ?? null;
      const viewport = viewportRef.current;
      if (!viewport) return;

      const saved = readSavedScroll(sessionKey);
      if (!saved || saved.t <= 0) return;

      pendingRef.current = saved;
      restoreUntilRef.current = Date.now() + RESTORE_WINDOW_MS;
      viewport.scrollTop = Math.max(offsetRef.current, saved.t);
      requestAnimationFrame(restore);
    },
    [restore, sessionKey],
  );

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    restore();

    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(() => {
            restore();
          });
    const observeChild = () => {
      resizeObserver?.disconnect();
      const child = viewport.firstElementChild;
      if (child) resizeObserver?.observe(child);
    };
    observeChild();

    const mutationObserver =
      typeof MutationObserver === "undefined"
        ? null
        : new MutationObserver(() => {
            observeChild();
            restore();
          });
    mutationObserver?.observe(viewport, { childList: true });

    const handleTouchStart = () => {
      stopRestore();
    };

    const handleScroll = () => {
      if (applyingRef.current) return;

      stopRestore();
      cancelAnimationFrame(saveRafRef.current);
      saveRafRef.current = requestAnimationFrame(() => {
        writeSavedScroll(
          sessionKey,
          buildSavedScroll(viewport, offsetRef.current),
        );
      });
    };

    viewport.addEventListener("touchstart", handleTouchStart, {
      passive: true,
    });
    viewport.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      viewport.removeEventListener("touchstart", handleTouchStart);
      viewport.removeEventListener("scroll", handleScroll);
      resizeObserver?.disconnect();
      mutationObserver?.disconnect();
      cancelAnimationFrame(saveRafRef.current);
      cancelAnimationFrame(applyRafRef.current);
      applyingRef.current = false;
    };
  }, [restore, sessionKey, stopRestore]);

  const invalidate = useCallback(() => {
    cancelAnimationFrame(saveRafRef.current);
    saveRafRef.current = 0;
    stopRestore();
    clearSavedScroll(sessionKey);
    if (viewportRef.current) viewportRef.current.scrollTop = offsetRef.current;
  }, [sessionKey, stopRestore]);

  const capture = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const saved = buildSavedScroll(viewport, offsetRef.current);
    pendingRef.current = saved;
    if (!saved) {
      clearSavedScroll(sessionKey);
      return;
    }

    restoreUntilRef.current = Date.now() + RESTORE_WINDOW_MS;
    writeSavedScroll(sessionKey, saved);
    requestAnimationFrame(restore);
  }, [restore, sessionKey]);

  const flush = useCallback(() => {
    const saved = pendingRef.current ?? readSavedScroll(sessionKey);
    if (!saved) return;

    pendingRef.current = saved;
    restoreUntilRef.current = Date.now() + RESTORE_WINDOW_MS;
    restore();
    requestAnimationFrame(restore);
  }, [restore, sessionKey]);

  const settle = useCallback(() => {
    stopRestore();
  }, [stopRestore]);

  return { capture, flush, invalidate, ref: attachRef, settle };
}

function buildSavedScroll(
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

function clampScrollTop(
  viewport: HTMLElement,
  target: number,
  scrollOffset: number,
): null | number {
  const max = Math.max(0, viewport.scrollHeight - viewport.clientHeight);
  if (max === 0) return target >= scrollOffset ? scrollOffset : null;
  return Math.min(max, Math.max(scrollOffset, target));
}

function clearSavedScroll(sessionKey: string) {
  const storage = getSessionStorage();
  if (!storage) return;
  try {
    storage.removeItem(sessionKey);
  } catch {
    return undefined;
  }
}

function findSavedAnchor(viewport: HTMLElement, saved: SavedScroll) {
  const children = Array.from(viewport.firstElementChild?.children ?? []);
  if (saved.k) {
    const keyedChild = children.find(
      (child) => getScrollAnchorKey(child) === saved.k,
    );
    if (keyedChild) return keyedChild;
  }

  return children.at(saved.ai) ?? null;
}

function getElementOffset(element: Element, viewport: HTMLElement) {
  return (
    element.getBoundingClientRect().top -
    viewport.getBoundingClientRect().top +
    viewport.scrollTop
  );
}

function getScrollAnchorKey(element: Element) {
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

function getSessionStorage() {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

function isSavedScroll(value: unknown): value is SavedScroll {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<SavedScroll>;
  return (
    Number.isFinite(candidate.ai) &&
    Number.isFinite(candidate.ao) &&
    Number.isFinite(candidate.t)
  );
}

function readSavedScroll(sessionKey: string): null | SavedScroll {
  const storage = getSessionStorage();
  if (!storage) return null;
  try {
    const raw = storage.getItem(sessionKey);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isSavedScroll(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeSavedScroll(sessionKey: string, saved: null | SavedScroll) {
  const storage = getSessionStorage();
  if (!storage) return;
  try {
    if (!saved) {
      storage.removeItem(sessionKey);
      return;
    }
    storage.setItem(sessionKey, JSON.stringify(saved));
  } catch {
    return undefined;
  }
}
