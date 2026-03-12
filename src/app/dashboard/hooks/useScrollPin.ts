"use client";

/**
 * ## Scroll-pin protocol for article expand/collapse transitions
 *
 * ### Problem solved
 * CSS `max-height` transitions progressively change `scrollHeight`.
 * The browser's scroll clamp (`scrollTop ≤ scrollHeight - clientHeight`)
 * runs *during* the transition, causing three bugs:
 *
 * 1. **Collapse → scroll jumps to bottom**: as the article card shrinks,
 *    `scrollHeight` decreases frame-by-frame. The browser clamps
 *    `scrollTop` downward each frame, dragging the viewport to the
 *    bottom of the page. (30+ frames of iteration to fix)
 *
 * 2. **Expand → scroll jumps erratically**: the ResizeObserver in
 *    `usePullDownToRefresh` calls `ensureMinOverflow()` and sentinel
 *    snap-back during the expansion, fighting browser scroll anchoring
 *    and any user scroll input.
 *
 * 3. **Expand → fixed timeout races hydration**: using a fixed
 *    `expandDuration + 80ms` timer to release the pin doesn't account
 *    for hydration latency. The CSS transition starts *after* hydration
 *    completes, so the pin expires mid-animation.
 *
 * ### Solution: three-mode shared ref
 *
 * `suppressSnapRef: React.RefObject<number | false>` is shared between
 * `useArticleActions` (writer) and `usePullDownToRefresh` (reader).
 *
 * | Value        | Mode              | ResizeObserver behavior    |
 * |------------- |-------------------|---------------------------|
 * | `false`      | Normal            | `ensureMinOverflow()` + sentinel snap-back |
 * | `number > 0` | Collapse pin      | Pad bottom + `scrollTop = target` every frame |
 * | `-1`         | Expand suppress   | Skip entirely — no padding, no scrollTop writes |
 *
 * ### Collapse pin (mode: positive number)
 * At collapse start, `suppressSnapRef` is set to `savedScrollTop ?? 104`.
 * The ResizeObserver in `useSentinelLayout` detects the positive number and
 * on every resize callback: adds enough `paddingBottom` so `scrollHeight`
 * stays large enough, then sets `viewport.scrollTop = target`. This holds
 * the viewport in place while the card animates closed. Released after
 * `collapseDuration + 80ms`.
 *
 * ### Expand suppress (mode: -1)
 * At expand start, `suppressSnapRef = -1`. The ResizeObserver skips entirely
 * — no `ensureMinOverflow()`, no `scrollTop` writes — so browser scroll
 * anchoring handles expansion naturally and user scrolling is unimpeded.
 * Released when the actual `transitionend` event fires for `max-height` on
 * the article element, with a 3s safety fallback.
 *
 * ### Why transitionend, not a fixed timeout (expand)
 * Hydration is async. The CSS transition starts only after content renders
 * (`phase: revealing → expanded`). A fixed timeout from toggle time would
 * expire before the transition finishes. Listening for `transitionend` on
 * the article DOM element guarantees the pin lasts exactly as long as the
 * animation.
 */

import { useCallback, useEffect, useRef } from "react";

import { escapeArticleKey } from "./useArticleHydration";

/** Value written to suppressSnapRef. */
export type ScrollPinTarget = false | number;

type CleanupRef = React.RefObject<(() => void) | null>;
interface ScrollPinActions {
  /**
   * Activate collapse pin mode. Captures `scrollTop` and holds it stable
   * via the ResizeObserver while the CSS max-height transition shrinks
   * the card. Released after `collapseDuration + 80ms`.
   *
   * Fixes: scroll jumps to bottom on article collapse.
   */
  activateCollapsePin: (
    savedViewport: HTMLElement | null,
    savedScrollTop: null | number,
  ) => void;

  /**
   * Activate expand suppress mode. Tells the ResizeObserver to skip
   * entirely during the CSS max-height expansion. Released when the
   * actual `transitionend` event fires on the article element.
   *
   * Fixes: scroll jumps erratically while expanding article + scrolling.
   * Fixes: suppress timer expiring before transition (hydration latency).
   */
  activateExpandSuppress: (articleKey: string) => void;

  /** Cancel any in-flight pin/suppress and restore normal mode. */
  cancelPin: () => void;

  /** ScrollTop captured at expand time — collapse restores to this value. */
  preExpandScrollTop: React.RefObject<null | number>;
  /** Viewport captured at expand time — used for collapse scroll-restore. */
  preExpandViewport: React.RefObject<HTMLElement | null>;
}

type SnapRef = React.RefObject<ScrollPinTarget> | undefined;

/**
 * Activate collapse pin mode. Writes `pinTarget` to `suppressSnapRef`,
 * scrolls the viewport there immediately, and schedules release after
 * `collapseDuration + 80ms`.
 *
 * Fixes: scroll jumps to bottom during article collapse animation.
 */
export function activateCollapsePin(
  suppressSnapRef: SnapRef,
  pinCleanupRef: CleanupRef,
  preExpandViewport: React.RefObject<HTMLElement | null>,
  preExpandScrollTop: React.RefObject<null | number>,
  savedViewport: HTMLElement | null,
  savedScrollTop: null | number,
) {
  cancelScrollPin(pinCleanupRef);
  preExpandViewport.current = null;
  preExpandScrollTop.current = null;

  const pinTarget = savedScrollTop ?? 104;
  if (suppressSnapRef) suppressSnapRef.current = pinTarget;
  if (savedViewport) savedViewport.scrollTop = pinTarget;

  const collapseDuration =
    typeof getComputedStyle === "function"
      ? parseFloat(
          getComputedStyle(document.body).getPropertyValue(
            "--motion-duration-expand",
          ),
        ) || 240
      : 240;

  const releaseId = window.setTimeout(() => {
    if (suppressSnapRef) suppressSnapRef.current = false;
  }, collapseDuration + 80);

  pinCleanupRef.current = () => {
    window.clearTimeout(releaseId);
    if (suppressSnapRef) suppressSnapRef.current = false;
  };
}

/**
 * Activate expand suppress mode. Queries the DOM for the article element,
 * captures viewport + scrollTop, writes `-1` to `suppressSnapRef`, and
 * listens for `transitionend` to release.
 *
 * Fixes: scroll jumps erratically while expanding + scrolling.
 * Fixes: fixed timeout races hydration latency.
 */
export function activateExpandSuppress(
  suppressSnapRef: SnapRef,
  pinCleanupRef: CleanupRef,
  preExpandViewport: React.RefObject<HTMLElement | null>,
  preExpandScrollTop: React.RefObject<null | number>,
  articleKey: string,
) {
  cancelScrollPin(pinCleanupRef);
  preExpandViewport.current = null;
  preExpandScrollTop.current = null;

  try {
    const el = document.querySelector<HTMLElement>(
      `[data-article-key="${escapeArticleKey(articleKey)}"]`,
    );
    const vp =
      el?.closest<HTMLElement>("[data-radix-scroll-area-viewport]") ?? null;

    if (!el || !vp) return;

    preExpandViewport.current = vp;
    preExpandScrollTop.current = vp.scrollTop;

    if (suppressSnapRef) suppressSnapRef.current = -1;

    const release = () => {
      if (suppressSnapRef) suppressSnapRef.current = false;
    };

    const onTransitionEnd = (e: TransitionEvent) => {
      if (e.propertyName !== "max-height") return;
      el.removeEventListener("transitionend", onTransitionEnd);
      window.clearTimeout(fallbackId);
      window.setTimeout(release, 80);
    };
    el.addEventListener("transitionend", onTransitionEnd);

    // 3s safety fallback if transitionend never fires.
    const fallbackId = window.setTimeout(() => {
      el.removeEventListener("transitionend", onTransitionEnd);
      release();
    }, 3000);

    pinCleanupRef.current = () => {
      el.removeEventListener("transitionend", onTransitionEnd);
      window.clearTimeout(fallbackId);
      release();
    };
  } catch {
    /* DOM query failure */
  }
}

/**
 * Cancel any in-flight pin/suppress timer and restore normal mode.
 */
export function cancelScrollPin(pinCleanupRef: CleanupRef) {
  pinCleanupRef.current?.();
  pinCleanupRef.current = null;
}

/**
 * Manages the scroll-pin lifecycle for article expand/collapse transitions.
 *
 * Owns the `pinCleanupRef` and pre-expand capture refs. The `suppressSnapRef`
 * is created and owned by DashboardView, passed in here as a parameter.
 */
export function useScrollPin(
  suppressSnapRef: React.RefObject<false | number> | undefined,
): ScrollPinActions {
  const pinCleanupRef = useRef<(() => void) | null>(null);
  const preExpandViewport = useRef<HTMLElement | null>(null);
  const preExpandScrollTop = useRef<null | number>(null);

  const cancel = useCallback(() => {
    cancelScrollPin(pinCleanupRef);
  }, []);

  useEffect(() => cancel, [cancel]);

  const collapse = useCallback(
    (savedViewport: HTMLElement | null, savedScrollTop: null | number) => {
      activateCollapsePin(
        suppressSnapRef,
        pinCleanupRef,
        preExpandViewport,
        preExpandScrollTop,
        savedViewport,
        savedScrollTop,
      );
    },
    [suppressSnapRef],
  );

  const expand = useCallback(
    (articleKey: string) => {
      activateExpandSuppress(
        suppressSnapRef,
        pinCleanupRef,
        preExpandViewport,
        preExpandScrollTop,
        articleKey,
      );
    },
    [suppressSnapRef],
  );

  return {
    activateCollapsePin: collapse,
    activateExpandSuppress: expand,
    cancelPin: cancel,
    preExpandScrollTop,
    preExpandViewport,
  };
}
