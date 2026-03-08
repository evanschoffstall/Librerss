"use client";

import { useCallback, useEffect, useRef } from "react";

// How long (ms) to keep reapplying the saved scroll target after mount.
// Covers the full loading → article-list → hydration render pipeline.
const RESTORE_WINDOW_MS = 3000;

/**
 * Saved state written to sessionStorage.
 *
 * `t`  – raw scrollTop at save time (used for immediate restore while content loads).
 * `ai` – index of the anchor child element inside the content wrapper.
 * `ao` – distance (px) from the viewport top to that element's top at save time.
 *        Negative means the element was above the visible area.
 */
type SavedState = { t: number; ai: number; ao: number };

function parseSavedState(raw: string): SavedState | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (
      parsed !== null &&
      typeof parsed === "object" &&
      "t" in parsed &&
      "ai" in parsed &&
      "ao" in parsed
    ) {
      return parsed as SavedState;
    }
  } catch {
    // Legacy plain-number format written by older versions of this hook.
    const n = Number(raw);
    if (Number.isFinite(n)) return { t: n, ai: -1, ao: 0 };
  }
  return null;
}

/**
 * Returns `el`'s top offset relative to the start of the scrollable content
 * (i.e. what scrollTop would need to be for that element to sit at the
 * very top of the viewport).
 */
function elementOffsetInContent(el: Element, viewport: HTMLElement): number {
  return (
    el.getBoundingClientRect().top -
    viewport.getBoundingClientRect().top +
    viewport.scrollTop
  );
}

function buildSavedState(
  viewport: HTMLElement,
  scrollTopOffset: number,
): SavedState | null {
  const top = viewport.scrollTop;
  if (top <= scrollTopOffset) {
    return null;
  }

  const contentWrapper = viewport.firstElementChild;
  let anchorIndex = -1;
  let anchorOffset = 0;

  if (contentWrapper) {
    const viewportTop = viewport.getBoundingClientRect().top;
    const children = Array.from(contentWrapper.children);
    for (let i = 0; i < children.length; i++) {
      const childTop = children[i].getBoundingClientRect().top - viewportTop;
      if (childTop >= -1) {
        anchorIndex = i;
        anchorOffset = childTop;
        break;
      }
    }
    if (anchorIndex === -1 && children.length > 0) {
      anchorIndex = children.length - 1;
      anchorOffset =
        children[anchorIndex].getBoundingClientRect().top - viewportTop;
    }
  }

  return { t: top, ai: anchorIndex, ao: anchorOffset };
}

/**
 * Persists & restores the scroll position of a Radix ScrollArea viewport to
 * sessionStorage so it survives HMR reloads and full-page refreshes.
 *
 * Returns a ref-callback to attach to the ScrollArea *root*. The hook
 * internally finds the `[data-radix-scroll-area-viewport]` child.
 */
export function useScrollRestore(
  sessionKey: string,
  /** Fixed pixel offset at the top of the scroll container to ignore
   *  (e.g. a pull-to-refresh sentinel hidden via scrollTop). */
  scrollTopOffset = 0,
) {
  const viewportRef = useRef<HTMLElement | null>(null);
  const rafId = useRef<number>(0);
  const restoreScrollEventRafId = useRef<number>(0);
  const savedStateRef = useRef<SavedState | null>(null);
  const restoreDeadlineRef = useRef<number>(0);
  const isApplyingRestoreScrollRef = useRef(false);
  const offsetRef = useRef(scrollTopOffset);
  offsetRef.current = scrollTopOffset;

  const applyRestoredScrollTop = useCallback(
    (viewport: HTMLElement, targetScrollTop: number) => {
      if (Math.abs(viewport.scrollTop - targetScrollTop) <= 1) return;

      isApplyingRestoreScrollRef.current = true;
      viewport.scrollTop = targetScrollTop;

      cancelAnimationFrame(restoreScrollEventRafId.current);
      restoreScrollEventRafId.current = requestAnimationFrame(() => {
        isApplyingRestoreScrollRef.current = false;
      });
    },
    [],
  );

  // ── anchor-aware restore ───────────────────────────────────────────────────
  const restoreScrollIfNeeded = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    if (Date.now() > restoreDeadlineRef.current) {
      savedStateRef.current = null;
      return;
    }

    // Recover from sessionStorage if savedStateRef was cleared by a scroll
    // event during content replacement (feed refresh).
    let saved = savedStateRef.current;
    if (!saved) {
      try {
        const raw = sessionStorage.getItem(sessionKey);
        if (raw) saved = parseSavedState(raw);
      } catch {
        /* ignore */
      }
      if (!saved) return;
      savedStateRef.current = saved;
    }

    const contentWrapper = viewport.firstElementChild;

    // Anchor path: find the saved child and compute the exact scrollTop that
    // recreates the same visual offset, regardless of how content heights have
    // changed beneath or above it.
    if (contentWrapper && saved.ai >= 0) {
      const children = contentWrapper.children;
      if (saved.ai < children.length) {
        const anchor = children[saved.ai];
        const targetScrollTop =
          elementOffsetInContent(anchor, viewport) - saved.ao;
        if (targetScrollTop >= 0) {
          applyRestoredScrollTop(viewport, targetScrollTop);
        }
        return;
      }
    }

    // Fallback: raw scrollTop (used while skeleton is showing / no children yet).
    const maxScrollTop = Math.max(
      0,
      viewport.scrollHeight - viewport.clientHeight,
    );
    if (maxScrollTop === 0) return;
    applyRestoredScrollTop(viewport, Math.min(saved.t, maxScrollTop));
  }, [applyRestoredScrollTop, sessionKey]);

  // ── restore once the viewport mounts ──────────────────────────────────────
  const attachRef = useCallback(
    (rootNode: HTMLElement | null) => {
      if (!rootNode) {
        viewportRef.current = null;
        return;
      }

      const viewport = rootNode.querySelector<HTMLElement>(
        "[data-radix-scroll-area-viewport]",
      );

      viewportRef.current = viewport;
      if (!viewport) return;

      try {
        const raw = sessionStorage.getItem(sessionKey);
        if (raw !== null) {
          const state = parseSavedState(raw);
          if (state && state.t > 0) {
            savedStateRef.current = state;
            restoreDeadlineRef.current = Date.now() + RESTORE_WINDOW_MS;
            // Immediately rough-position to clamp scrollTop above any sentinel
            // offset and avoid a one-frame flash before the rAF fires.
            viewport.scrollTop = Math.max(offsetRef.current, state.t);
            requestAnimationFrame(() => restoreScrollIfNeeded());
          }
        }
      } catch {
        // Ignore parse / security errors.
      }
    },
    [restoreScrollIfNeeded, sessionKey],
  );

  // ── persist on scroll and retry restore on layout changes ─────────────────
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    restoreScrollIfNeeded();

    // ResizeObserver watches the current content child so we re-apply the
    // anchor scroll whenever an article card grows (e.g. hydration).
    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(() => restoreScrollIfNeeded());

    const observeCurrentChild = () => {
      resizeObserver?.disconnect();
      const child = viewport.firstElementChild;
      if (child) resizeObserver?.observe(child);
    };

    observeCurrentChild();

    // MutationObserver re-binds ResizeObserver when React swaps the viewport's
    // direct child (e.g. key="feed-loading" → key="feed-list").
    const mutationObserver =
      typeof MutationObserver === "undefined"
        ? null
        : new MutationObserver(() => {
            observeCurrentChild();
            restoreScrollIfNeeded();
          });
    mutationObserver?.observe(viewport, { childList: true });

    // ── save anchor-state on scroll ──────────────────────────────────────────
    const handleScroll = () => {
      if (isApplyingRestoreScrollRef.current) return;

      // A real user scroll permanently ends the restore window so the
      // ResizeObserver can never re-read sessionStorage and fight the scroll.
      savedStateRef.current = null;
      restoreDeadlineRef.current = 0;

      cancelAnimationFrame(rafId.current);
      rafId.current = requestAnimationFrame(() => {
        const state = buildSavedState(viewport, offsetRef.current);
        try {
          if (!state) {
            sessionStorage.removeItem(sessionKey);
          } else {
            sessionStorage.setItem(sessionKey, JSON.stringify(state));
          }
        } catch {
          /* quota / policy — ignore */
        }
      });
    };

    viewport.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      viewport.removeEventListener("scroll", handleScroll);
      resizeObserver?.disconnect();
      mutationObserver?.disconnect();
      cancelAnimationFrame(rafId.current);
      cancelAnimationFrame(restoreScrollEventRafId.current);
      isApplyingRestoreScrollRef.current = false;
    };
  }, [restoreScrollIfNeeded, sessionKey]);

  const invalidate = useCallback(() => {
    savedStateRef.current = null;
    try {
      sessionStorage.removeItem(sessionKey);
    } catch {
      /* ignore */
    }
    const viewport = viewportRef.current;
    if (viewport) viewport.scrollTop = offsetRef.current;
  }, [sessionKey]);

  const capture = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport) {
      return;
    }

    const state = buildSavedState(viewport, offsetRef.current);
    if (!state) {
      savedStateRef.current = null;
      try {
        sessionStorage.removeItem(sessionKey);
      } catch {
        /* ignore */
      }
      return;
    }

    savedStateRef.current = state;
    restoreDeadlineRef.current = Date.now() + RESTORE_WINDOW_MS;
    try {
      sessionStorage.setItem(sessionKey, JSON.stringify(state));
    } catch {
      /* ignore */
    }
    requestAnimationFrame(() => restoreScrollIfNeeded());
  }, [restoreScrollIfNeeded, sessionKey]);

  // Kills the restore window without touching scrollTop or sessionStorage.
  // Call whenever the user interacts in a way that makes restore irrelevant
  // (e.g. expanding an article card that resizes the content).
  const settle = useCallback(() => {
    savedStateRef.current = null;
    restoreDeadlineRef.current = 0;
  }, []);

  return { ref: attachRef, invalidate, capture, settle };
}
