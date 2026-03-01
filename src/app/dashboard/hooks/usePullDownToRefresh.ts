"use client";

import { useEffect, useRef, useState } from "react";

/** Height of the hidden pull zone above content. */
export const SENTINEL_HEIGHT = 104;
/** Distance (px into sentinel) user must pull to commit. */
const PULL_THRESHOLD = 56;
/** Hold height during refresh feedback. */
const HOLD_PULL_PX = 44;
/** Hold duration before snapping back. */
const REFRESH_HOLD_MS = 650;
/** Wheel inactivity ms before treating scroll as ended. */
const WHEEL_END_DEBOUNCE_MS = 150;

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
 * Works on both touch (mobile) and wheel/trackpad (desktop).
 * Momentum-only scroll into the sentinel zone is snapped back immediately
 * so pull-to-refresh only triggers with active user input.
 */
export function usePullDownToRefresh(
  scrollRootRef: React.RefObject<HTMLElement | null>,
  onRefresh: () => void,
  disabled = false,
) {
  const [state, setState] = useState<PullState>(IDLE);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const touchActiveRef = useRef(false);
  const wheelActiveRef = useRef(false);
  const committedRef = useRef(false);
  const pullingRef = useRef(false);
  const holdingRef = useRef(false);
  const snapTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const wheelEndTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(
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
    /** Live-read sentinel height — handles late layout. */
    const sh = () => sentinel?.offsetHeight ?? 0;

    const resetPull = () => {
      holdingRef.current = false;
      pullingRef.current = false;
      committedRef.current = false;
      clearTimeout(snapTimerRef.current);
      snapTimerRef.current = undefined;
      setState(IDLE);
    };

    // Prevent iOS from rubber-banding the page
    viewport.style.overscrollBehaviorY = "none";

    const wrapper = sentinel?.parentElement ?? null;

    /**
     * Ensures viewport.scrollHeight >= viewport.clientHeight + sentinelHeight
     * so that setting scrollTop = sentinelHeight is never clamped to 0.
     */
    const ensureMinOverflow = () => {
      const height = sh();
      if (height === 0 || !wrapper) return;
      wrapper.style.paddingBottom = "";
      const contentHeight = wrapper.offsetHeight;
      const needed = viewport.clientHeight + height - contentHeight;
      if (needed > 0) wrapper.style.paddingBottom = `${needed}px`;
    };

    ensureMinOverflow();
    viewport.scrollTop = sh();

    const rafId = requestAnimationFrame(() => {
      ensureMinOverflow();
      const height = sh();
      if (height > 0 && viewport.scrollTop < height)
        viewport.scrollTop = height;
    });

    const resizeObserver =
      typeof ResizeObserver !== "undefined" && wrapper
        ? new ResizeObserver(() => {
            ensureMinOverflow();
            const height = sh();
            if (
              height > 0 &&
              viewport.scrollTop < height &&
              !touchActiveRef.current &&
              !wheelActiveRef.current &&
              !holdingRef.current
            ) {
              viewport.scrollTop = height;
            }
          })
        : null;
    resizeObserver?.observe(wrapper!);

    /** True when active user input (touch or wheel) is driving scroll. */
    const isInputActive = () =>
      touchActiveRef.current || wheelActiveRef.current;

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
        viewport.scrollTo({ top: height, behavior: "smooth" });
        setState(IDLE);
      }
      committedRef.current = false;
    };

    const handleScroll = () => {
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

      // No active input — momentum overshoot, snap back
      if (!isInputActive()) {
        if (!snapTimerRef.current) {
          snapTimerRef.current = setTimeout(() => {
            snapTimerRef.current = undefined;
            const h = sh();
            if (h > 0 && viewport.scrollTop < h) {
              viewport.scrollTo({ top: h, behavior: "smooth" });
            }
          }, 80);
        }
        if (pullingRef.current) {
          pullingRef.current = false;
          setState(IDLE);
        }
        return;
      }

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

    // ── Wheel handlers (desktop / trackpad) ───────────────────────────────

    const handleWheelEnd = () => {
      wheelEndTimerRef.current = undefined;
      wheelActiveRef.current = false;
      commitOrSnapBack();
    };

    const handleWheel = () => {
      // Cancel any pending snap from the momentum guard in handleScroll
      clearTimeout(snapTimerRef.current);
      snapTimerRef.current = undefined;

      if (!wheelActiveRef.current) {
        wheelActiveRef.current = true;
        if (holdingRef.current) {
          resetPull();
          const h = sh();
          if (h > 0) viewport.scrollTo({ top: h, behavior: "smooth" });
          return;
        }
      }

      clearTimeout(wheelEndTimerRef.current);
      wheelEndTimerRef.current = setTimeout(
        handleWheelEnd,
        WHEEL_END_DEBOUNCE_MS,
      );
    };

    // ── Register listeners ────────────────────────────────────────────────

    viewport.addEventListener("scroll", handleScroll, { passive: true });
    viewport.addEventListener("touchstart", handleTouchStart, {
      passive: true,
    });
    viewport.addEventListener("touchend", handleTouchEnd);
    viewport.addEventListener("touchcancel", handleTouchCancel);
    viewport.addEventListener("wheel", handleWheel, { passive: true });

    return () => {
      resizeObserver?.disconnect();
      cancelAnimationFrame(rafId);
      clearTimeout(snapTimerRef.current);
      snapTimerRef.current = undefined;
      clearTimeout(wheelEndTimerRef.current);
      wheelEndTimerRef.current = undefined;
      viewport.style.overscrollBehaviorY = "";
      if (wrapper) wrapper.style.paddingBottom = "";
      viewport.removeEventListener("scroll", handleScroll);
      viewport.removeEventListener("touchstart", handleTouchStart);
      viewport.removeEventListener("touchend", handleTouchEnd);
      viewport.removeEventListener("touchcancel", handleTouchCancel);
      viewport.removeEventListener("wheel", handleWheel);
    };
  }, [scrollRootRef]);

  useEffect(() => {
    if (!disabled) return;
    const root = scrollRootRef.current;
    if (!root) return;
    const viewport =
      root.querySelector<HTMLElement>("[data-radix-scroll-area-viewport]") ??
      root;
    viewport.scrollTop = sentinelRef.current?.offsetHeight ?? 0;
    touchActiveRef.current = false;
    wheelActiveRef.current = false;
    committedRef.current = false;
    pullingRef.current = false;
    holdingRef.current = false;
    clearTimeout(snapTimerRef.current);
    snapTimerRef.current = undefined;
    clearTimeout(wheelEndTimerRef.current);
    wheelEndTimerRef.current = undefined;
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
