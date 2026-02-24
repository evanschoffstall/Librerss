"use client";

import { useCallback, useEffect, useRef } from "react";

// How long (ms) to keep reapplying the saved scroll target after mount.
// Covers the full loading → article-list → hydration render pipeline.
const RESTORE_WINDOW_MS = 3000;

/**
 * Persists & restores the scroll position of a Radix ScrollArea viewport to
 * sessionStorage so it survives HMR reloads and full-page refreshes.
 *
 * Returns a ref-callback to attach to the ScrollArea *root*. The hook
 * internally finds the `[data-radix-scroll-area-viewport]` child.
 */
export function useScrollRestore(sessionKey: string) {
  const viewportRef = useRef<HTMLElement | null>(null);
  const rafId = useRef<number>(0);
  // null  → no restore pending
  // number → target scrollTop to reach
  const restoreTargetRef = useRef<number | null>(null);
  // Absolute timestamp after which we stop forcing the position.
  const restoreDeadlineRef = useRef<number>(0);

  const restoreScrollIfNeeded = useCallback(() => {
    const viewport = viewportRef.current;
    const restoreTarget = restoreTargetRef.current;
    if (!viewport || restoreTarget === null) return;

    // Give up once the deadline has passed — let normal scroll events take over.
    if (Date.now() > restoreDeadlineRef.current) {
      restoreTargetRef.current = null;
      return;
    }

    const maxScrollTop = Math.max(
      0,
      viewport.scrollHeight - viewport.clientHeight,
    );

    // No scrollable content yet — wait for next resize/mutation.
    if (maxScrollTop === 0) return;

    viewport.scrollTop = Math.min(restoreTarget, maxScrollTop);
  }, []);

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
        const stored = sessionStorage.getItem(sessionKey);
        if (stored !== null) {
          const top = Number(stored);
          if (Number.isFinite(top) && top > 0) {
            restoreTargetRef.current = top;
            restoreDeadlineRef.current = Date.now() + RESTORE_WINDOW_MS;
            // Defer so React has finished painting the children.
            requestAnimationFrame(() => {
              restoreScrollIfNeeded();
            });
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

    // Try immediately (handles the case where content was already rendered
    // before the effect ran).
    restoreScrollIfNeeded();

    // ResizeObserver: re-binds to the *current* direct child of the viewport
    // when the feed transitions (loading skeleton → article list → hydrated).
    // The viewport's own CSS size is fixed, so we must watch the content child.
    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(() => {
            restoreScrollIfNeeded();
          });

    const observeCurrentChild = () => {
      resizeObserver?.disconnect();
      const child = viewport.firstElementChild;
      if (child) resizeObserver?.observe(child as HTMLElement);
    };

    observeCurrentChild();

    // MutationObserver: detects when React replaces the viewport's direct child
    // (e.g., key="feed-loading" → key="feed-list") so we re-bind ResizeObserver
    // to the new element rather than watching a stale, detached node.
    const mutationObserver =
      typeof MutationObserver === "undefined"
        ? null
        : new MutationObserver(() => {
            observeCurrentChild();
            restoreScrollIfNeeded();
          });
    mutationObserver?.observe(viewport, { childList: true });

    const handleScroll = () => {
      // A user-initiated scroll cancels the pending restore so the user isn't
      // fighting against the hook trying to snap them back.
      if (restoreTargetRef.current !== null) {
        restoreTargetRef.current = null;
      }
      cancelAnimationFrame(rafId.current);
      rafId.current = requestAnimationFrame(() => {
        try {
          sessionStorage.setItem(sessionKey, String(viewport.scrollTop));
        } catch {
          // Quota / policy — ignore.
        }
      });
    };

    viewport.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      viewport.removeEventListener("scroll", handleScroll);
      resizeObserver?.disconnect();
      mutationObserver?.disconnect();
      cancelAnimationFrame(rafId.current);
    };
  }, [restoreScrollIfNeeded, sessionKey]);

  return attachRef;
}
