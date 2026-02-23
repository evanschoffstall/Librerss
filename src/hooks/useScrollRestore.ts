"use client";

import { useCallback, useEffect, useRef } from "react";

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
          if (Number.isFinite(top)) {
            // Defer so React has finished painting the children.
            requestAnimationFrame(() => {
              viewport.scrollTop = top;
            });
          }
        }
      } catch {
        // Ignore parse / security errors.
      }
    },
    [sessionKey],
  );

  // ── persist on scroll (throttled via rAF) ─────────────────────────────────
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const handleScroll = () => {
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
      cancelAnimationFrame(rafId.current);
    };
  });

  return attachRef;
}
