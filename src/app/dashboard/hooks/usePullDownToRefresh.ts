"use client";

import { useEffect, useRef, useState } from "react";
import { attachSentinelLayout, SENTINEL_HEIGHT } from "./useSentinelLayout";
/** Distance (px into sentinel) user must pull to commit. */
const PULL_THRESHOLD = 56;
/** Hold height during refresh feedback. */
const HOLD_PULL_PX = 44;
/** Hold duration before snapping back. */
const REFRESH_HOLD_MS = 650;

interface PullState {
  pulling: boolean;
  readyToRefresh: boolean;
}

const IDLE: PullState = { pulling: false, readyToRefresh: false };

/**
 * Pull-to-refresh using a hidden sentinel div inside the ScrollArea.
 *
 * The sentinel is a real scroll item (SENTINEL_HEIGHT px tall) placed
 * before the feed content. On mount the viewport scrolls past it so it's
 * invisible. Pulling down from the top naturally scrolls into the sentinel
 * zone — 100% native scroll compositor, zero transforms or layout writes.
 *
 * All input methods (touch, wheel, trackpad) activate the pull indicator
 * and can trigger refresh. On scrollend without active touch, the sentinel
 * snaps back if the pull threshold wasn't met.
 *
 * ## Collapse scroll-pin (DO NOT REMOVE)
 *
 * `suppressSnapRef` coordinates with `useArticleActions` during collapse:
 * - `false` → normal sentinel snap-back (scrollTop ≥ SENTINEL_HEIGHT).
 * - `number > 0` → collapse pin mode: the ResizeObserver pins scrollTop to
 *   this value with enough bottom padding to prevent browser clamping
 *   while the CSS max-height transition progressively shrinks scrollHeight.
 * - `-1` → expand suppress mode: the ResizeObserver skips entirely so
 *   browser scroll anchoring and user scrolling are unimpeded.
 *   handleScroll and handleScrollEnd bail out in both non-false modes.
 *   Released back to `false` by useArticleActions after the transition.
 */
export function usePullDownToRefresh(
  scrollRootRef: React.RefObject<HTMLElement | null>,
  onRefresh: () => void,
  disabled = false,
  suppressSnapRef?: React.RefObject<number | false>,
) {
  const [state, setState] = useState<PullState>(IDLE);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const touchActiveRef = useRef(false);
  const committedRef = useRef(false);
  const pullingRef = useRef(false);
  const holdingRef = useRef(false);
  const snapTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const disabledRef = useRef(disabled);
  const onRefreshRef = useRef(onRefresh);
  disabledRef.current = disabled;
  onRefreshRef.current = onRefresh;

  useEffect(() => {
    const root = scrollRootRef.current;
    if (!root) return;

    const viewport =
      root.querySelector<HTMLElement>("[data-radix-scroll-area-viewport]") ??
      root;

    const sentinel = sentinelRef.current;
    const sh = () => sentinel?.offsetHeight ?? 0;
    const wrapper = sentinel?.parentElement ?? null;

    const resetPull = () => {
      holdingRef.current = false;
      pullingRef.current = false;
      committedRef.current = false;
      clearTimeout(snapTimerRef.current);
      snapTimerRef.current = undefined;
      setState(IDLE);
    };

    // Delegate all layout invariants (sentinel visibility, overflow padding,
    // scrollbar inset, ResizeObserver three-mode branching) to the extracted
    // sentinel layout engine. See useSentinelLayout.ts for full docs.
    const cleanupLayout = attachSentinelLayout(
      { viewport, sentinel, wrapper, scrollRoot: root },
      suppressSnapRef,
      {
        touchActive: touchActiveRef,
        holding: holdingRef,
        pulling: pullingRef,
      },
    );

    const commitOrSnapBack = () => {
      const height = sh();
      const st = viewport.scrollTop;
      if (st >= height) return;

      if (committedRef.current && !disabledRef.current) {
        holdingRef.current = true;
        viewport.scrollTo({ top: height - HOLD_PULL_PX, behavior: "smooth" });
        onRefreshRef.current();
        snapTimerRef.current = setTimeout(() => {
          resetPull();
          const h = sh();
          if (h > 0) viewport.scrollTo({ top: h, behavior: "smooth" });
        }, REFRESH_HOLD_MS);
      } else {
        pullingRef.current = false;
        viewport.scrollTop = height;
        setState(IDLE);
      }
      committedRef.current = false;
    };

    const handleScroll = () => {
      if (typeof suppressSnapRef?.current === "number") return;
      const height = sh();
      if (height === 0) return;

      const st = viewport.scrollTop;
      if (st < 0) {
        viewport.scrollTop = 0;
        return;
      }

      if (st >= height) {
        if (pullingRef.current && !holdingRef.current) {
          pullingRef.current = false;
          setState(IDLE);
        }
        return;
      }

      if (holdingRef.current) return;

      const pullDistance = height - st;

      const committed = pullDistance >= PULL_THRESHOLD;
      const wasCommitted = committedRef.current;
      committedRef.current = committed;

      if (!pullingRef.current) {
        pullingRef.current = true;
        setState({ pulling: true, readyToRefresh: committed });
      } else if (committed !== wasCommitted) {
        setState({ pulling: true, readyToRefresh: committed });
      }
    };

    // ── Touch handlers ────────────────────────────────────────────────────

    const handleTouchStart = () => {
      touchActiveRef.current = true;
      clearTimeout(snapTimerRef.current);
      snapTimerRef.current = undefined;
      if (holdingRef.current) {
        resetPull();
        const h = sh();
        if (h > 0) viewport.scrollTo({ top: h, behavior: "smooth" });
      }
    };

    const handleTouchEnd = () => {
      touchActiveRef.current = false;
      commitOrSnapBack();
    };

    const handleTouchCancel = () => {
      touchActiveRef.current = false;
      resetPull();
      const height = sh();
      if (height > 0 && viewport.scrollTop < height) {
        viewport.scrollTo({ top: height, behavior: "smooth" });
      }
    };

    // When scroll settles inside sentinel without active touch, commit or snap back.
    const handleScrollEnd = () => {
      if (typeof suppressSnapRef?.current === "number") return;
      if (touchActiveRef.current || holdingRef.current) return;
      commitOrSnapBack();
    };

    // ── Register listeners ────────────────────────────────────────────────

    viewport.addEventListener("scroll", handleScroll, { passive: true });
    viewport.addEventListener("touchstart", handleTouchStart, {
      passive: true,
    });
    viewport.addEventListener("touchend", handleTouchEnd);
    viewport.addEventListener("touchcancel", handleTouchCancel);
    viewport.addEventListener("scrollend", handleScrollEnd);

    return () => {
      cleanupLayout();
      clearTimeout(snapTimerRef.current);
      snapTimerRef.current = undefined;
      viewport.removeEventListener("scroll", handleScroll);
      viewport.removeEventListener("touchstart", handleTouchStart);
      viewport.removeEventListener("touchend", handleTouchEnd);
      viewport.removeEventListener("touchcancel", handleTouchCancel);
      viewport.removeEventListener("scrollend", handleScrollEnd);
    };
  }, [scrollRootRef, suppressSnapRef]);

  useEffect(() => {
    if (!disabled) return;
    const root = scrollRootRef.current;
    if (!root) return;
    const viewport =
      root.querySelector<HTMLElement>("[data-radix-scroll-area-viewport]") ??
      root;
    viewport.scrollTop = sentinelRef.current?.offsetHeight ?? 0;
    touchActiveRef.current = false;
    committedRef.current = false;
    pullingRef.current = false;
    holdingRef.current = false;
    clearTimeout(snapTimerRef.current);
    snapTimerRef.current = undefined;
    setState(IDLE);
  }, [disabled, scrollRootRef]);

  return {
    pulling: state.pulling,
    readyToRefresh: state.readyToRefresh,
    sentinelRef,
    sentinelHeight: SENTINEL_HEIGHT,
  };
}

/** Scroll-restore offset: always SENTINEL_HEIGHT since sentinel is always present. */
export function useSentinelScrollOffset(): number {
  return SENTINEL_HEIGHT;
}
