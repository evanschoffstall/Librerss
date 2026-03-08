"use client";

import { useEffect, useRef, useState } from "react";

/** Height of the hidden pull zone above content. */
const SENTINEL_HEIGHT = 104;
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
 * Touch-only: wheel/trackpad scroll is clamped at the sentinel boundary
 * so pull-to-refresh only triggers with active touch input.
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

    /** Find the Radix scrollbar element (conditionally mounted by Presence). */
    const findScrollbar = () =>
      root.querySelector<HTMLElement>(':scope > [data-orientation="vertical"]');

    /** Apply or clear inset styles on the scrollbar to hide the sentinel zone. */
    const syncScrollbar = () => {
      const sb = findScrollbar();
      if (!sb) return;
      const height = sh();
      const H = viewport.scrollHeight;
      // Real content overflows only when scrollHeight > clientHeight + sentinel.
      // The padding added by ensureMinOverflow is exactly enough to not exceed that.
      const realOverflow = H - height > viewport.clientHeight;
      if (!realOverflow || height === 0) {
        sb.style.display = "none";
        return;
      }
      sb.style.display = "";
      // D = S·C/(H−S) makes translate3d(0, D, 0) land at the visible top edge.
      const inset =
        H > height ? (height * viewport.clientHeight) / (H - height) : 0;
      sb.style.marginTop = `-${inset.toFixed(2)}px`;
      sb.style.height = `calc(100% + ${inset.toFixed(2)}px)`;
    };

    /**
     * Ensures viewport.scrollHeight >= viewport.clientHeight + sentinelHeight
     * so that setting scrollTop = sentinelHeight is never clamped to 0.
     * Also offsets the scrollbar track so the thumb is flush at top when
     * the sentinel is scrolled out of view.
     */
    const ensureMinOverflow = () => {
      const height = sh();
      if (height === 0 || !wrapper) return;
      // Subtract our previously-set paddingBottom from offsetHeight so we
      // measure only real content.  Never strip-then-add: that transiently
      // reduces scrollHeight, which browsers use to clamp scrollTop, exposing
      // the sentinel during expand/collapse animations.
      const currentPad = parseFloat(wrapper.style.paddingBottom) || 0;
      const contentHeight = wrapper.offsetHeight - currentPad;
      const needed = Math.max(
        0,
        viewport.clientHeight + height - contentHeight,
      );
      const next = needed > 0 ? `${needed}px` : "";
      if (wrapper.style.paddingBottom !== next)
        wrapper.style.paddingBottom = next;
      syncScrollbar();
    };

    // Watch for Radix mounting/unmounting the scrollbar element via Presence.
    const mutObserver =
      typeof MutationObserver !== "undefined"
        ? new MutationObserver(syncScrollbar)
        : null;
    mutObserver?.observe(root, { childList: true, subtree: false });

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
            const target = suppressSnapRef?.current;
            if (typeof target === "number") {
              // Expand suppress: keep padding in sync but don't touch
              // scrollTop so browser anchoring and user scrolling are
              // unimpeded. Without this, stale padding gets removed all
              // at once when suppress releases, causing a scroll clamp.
              if (target < 0) {
                ensureMinOverflow();
                return;
              }
              // ── Collapse pin mode ───────────────────────────────────
              // The CSS max-height transition is changing scrollHeight.
              // Ensure enough paddingBottom so the browser never clamps
              // scrollTop below our target, then re-set scrollTop.
              const height = sh();
              if (height > 0 && wrapper) {
                const currentPad = parseFloat(wrapper.style.paddingBottom) || 0;
                const contentHeight = wrapper.offsetHeight - currentPad;
                const minContent =
                  viewport.clientHeight + Math.max(height, target);
                const needed = Math.max(0, minContent - contentHeight);
                const next = needed > 0 ? `${needed}px` : "";
                if (wrapper.style.paddingBottom !== next)
                  wrapper.style.paddingBottom = next;
                syncScrollbar();
              }
              viewport.scrollTop = target;
              return;
            }
            // ── Normal mode ───────────────────────────────────────────
            const scrollTopBefore = viewport.scrollTop;
            ensureMinOverflow();
            const height = sh();
            if (
              height > 0 &&
              scrollTopBefore < height &&
              viewport.scrollTop < height &&
              !touchActiveRef.current &&
              !holdingRef.current &&
              !pullingRef.current
            ) {
              viewport.scrollTop = height;
            }
          })
        : null;
    resizeObserver?.observe(wrapper!);

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

      // Non-touch scroll entered sentinel zone — clamp immediately.
      // Pull-to-refresh is touch-only.
      if (!touchActiveRef.current && !holdingRef.current) {
        viewport.scrollTop = height;
        if (pullingRef.current) {
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
      resizeObserver?.disconnect();
      mutObserver?.disconnect();
      cancelAnimationFrame(rafId);
      clearTimeout(snapTimerRef.current);
      snapTimerRef.current = undefined;
      viewport.style.overscrollBehaviorY = "";
      if (wrapper) wrapper.style.paddingBottom = "";
      const sb = findScrollbar();
      if (sb) {
        sb.style.marginTop = "";
        sb.style.height = "";
        sb.style.display = "";
      }
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
