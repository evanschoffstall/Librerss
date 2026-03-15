"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import { DASHBOARD_EVENTS } from "../constants";

import {
  clearPersistedPreExpandScroll,
  findArticleViewport,
  getScrollLockReleaseMs,
  readPersistedPreExpandScroll,
  scrollExpandedArticleIntoView,
  writePersistedPreExpandScroll,
} from "./feed-surface-scroll-lock";
import { escapeArticleKey } from "./useArticleHydration";

export const FEED_PULL_HEIGHT = 104;
export const FEED_PULL_OFFSET = 110;

const PULL_BUFFER = 8;
const PULL_THRESHOLD = 56;
const TOUCH_PULL_ACTIVATION_DISTANCE = 16;
const HOLD_OFFSET = 44;
const HOLD_MS = 650;
const RELEASE_MS = 200;
const WHEEL_SETTLE_MS = 280;

interface PullState {
  pulling: boolean;
  readyToRefresh: boolean;
}
type ScrollLockTarget = false | number;

const IDLE: PullState = { pulling: false, readyToRefresh: false };

/** Returns the hidden resting scroll offset reserved for the pull sentinel. */
export function useFeedPullOffset() {
  return FEED_PULL_OFFSET;
}

/**
 * Wires the dashboard scroll viewport to the hidden pull-to-refresh sentinel.
 *
 * The sentinel must render at zero height during SSR so the initial skeleton
 * paint cannot expose the reserved pull region before hydration restores the
 * hidden scroll offset. A pre-paint layout pass then enables the sentinel and
 * re-applies the resting offset without a visible flash.
 *
 * @param scrollRootRef Scroll root that contains the Radix viewport.
 * @param onRefresh Callback invoked after a committed pull gesture.
 * @param disabled Whether refresh commits should be suppressed.
 * @param lockRef Shared scroll lock used during article expand/collapse flows.
 * @returns Pull gesture state plus the sentinel ref and active layout height.
 */
export function useFeedPullRefresh(
  scrollRootRef: React.RefObject<HTMLElement | null>,
  onRefresh: () => void,
  disabled = false,
  lockRef?: React.RefObject<ScrollLockTarget>,
) {
  const [state, setState] = useState(IDLE);
  const [isLayoutReady, setIsLayoutReady] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const touchActiveRef = useRef(false);
  const touchLastScrollTopRef = useRef(FEED_PULL_OFFSET);
  const touchPullActiveRef = useRef(false);
  const touchPullEligibleRef = useRef(false);
  const wheelActiveRef = useRef(false);
  const wheelProxyPullRef = useRef(false);
  const lastWheelActivityAtRef = useRef(0);
  const pullingRef = useRef(false);
  const holdingRef = useRef(false);
  const committedRef = useRef(false);
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const wheelTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const releaseTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const disabledRef = useRef(disabled);
  const onRefreshRef = useRef(onRefresh);
  disabledRef.current = disabled;
  onRefreshRef.current = onRefresh;

  useLayoutEffect(() => {
    setIsLayoutReady(true);
  }, []);

  useLayoutEffect(() => {
    if (!isLayoutReady) return;
    const root = scrollRootRef.current;
    if (!root) return;
    const viewport =
      root.querySelector<HTMLElement>("[data-radix-scroll-area-viewport]") ??
      root;
    const wrapper = viewport.firstElementChild as HTMLElement | null;
    const feedWrapper = wrapper?.firstElementChild as HTMLElement | null;
    const sentinel =
      feedWrapper?.firstElementChild instanceof HTMLElement &&
      feedWrapper.firstElementChild.tagName === "DIV"
        ? feedWrapper.firstElementChild
        : sentinelRef.current;
    if (!sentinel || !wrapper) return;

    let lockMonitorFrame = 0;

    const stopLockMonitor = () => {
      if (lockMonitorFrame === 0) return;
      cancelAnimationFrame(lockMonitorFrame);
      lockMonitorFrame = 0;
    };

    const clearGestureTimers = () => {
      clearTimeout(holdTimerRef.current);
      clearTimeout(wheelTimerRef.current);
      clearTimeout(releaseTimerRef.current);
      holdTimerRef.current = undefined;
      wheelTimerRef.current = undefined;
      releaseTimerRef.current = undefined;
    };

    const clearGestureActivity = () => {
      stopLockMonitor();
      touchPullActiveRef.current = false;
      touchPullEligibleRef.current = false;
      wheelActiveRef.current = false;
      wheelProxyPullRef.current = false;
      lastWheelActivityAtRef.current = 0;
      pullingRef.current = false;
      holdingRef.current = false;
      committedRef.current = false;
      clearGestureTimers();
    };

    /**
     * Article expand/collapse locks take ownership of the viewport and must
     * immediately cancel any in-flight pull gesture so stale timers cannot
     * resurrect the sentinel once the lock releases.
     */
    const cancelPullForLock = () => {
      touchActiveRef.current = false;
      clearGestureActivity();
      setState((current) =>
        current.pulling || current.readyToRefresh ? IDLE : current,
      );
    };

    const shouldMonitorLock = () =>
      touchActiveRef.current ||
      wheelActiveRef.current ||
      pullingRef.current ||
      holdingRef.current ||
      committedRef.current ||
      holdTimerRef.current !== undefined ||
      wheelTimerRef.current !== undefined ||
      releaseTimerRef.current !== undefined;

    const startLockMonitor = () => {
      if (lockMonitorFrame !== 0 || !shouldMonitorLock()) return;
      const tick = () => {
        if (hasActiveLock()) {
          lockMonitorFrame = 0;
          cancelPullForLock();
          return;
        }
        if (!shouldMonitorLock()) {
          lockMonitorFrame = 0;
          return;
        }
        lockMonitorFrame = requestAnimationFrame(tick);
      };
      lockMonitorFrame = requestAnimationFrame(tick);
    };

    const reset = () => {
      clearGestureActivity();
      setState(IDLE);
    };

    /**
     * Content shrink/grow can transiently leave the viewport inside the pull
     * zone without any active gesture. In that case the sentinel should return
     * to an idle visual state instead of lingering on the armed refresh UI.
     */
    const clearIdlePullState = () => {
      stopLockMonitor();
      touchPullActiveRef.current = false;
      touchPullEligibleRef.current = false;
      wheelProxyPullRef.current = false;
      lastWheelActivityAtRef.current = 0;
      pullingRef.current = false;
      committedRef.current = false;
      setState((current) => (current.pulling ? IDLE : current));
    };

    /** Re-hides the sentinel after non-interactive layout changes clamp scrollTop. */
    const restoreIdleRestOffset = () => {
      if (viewport.scrollTop < FEED_PULL_OFFSET) {
        viewport.scrollTop = FEED_PULL_OFFSET;
      }
    };

    const hasActiveLock = () => typeof lockRef?.current === "number";

    const syncLayout = (pinTarget?: number) => {
      viewport.style.overscrollBehaviorY = "contain";
      viewport.style.overflowY = "scroll";
      viewport.style.touchAction = "pan-y";
      sentinel.style.height = `${FEED_PULL_HEIGHT}px`;
      const currentPad = parseFloat(wrapper.style.paddingBottom) || 0;
      const contentHeight = wrapper.offsetHeight - currentPad;
      const required = Math.max(
        0,
        viewport.clientHeight +
          Math.max(FEED_PULL_OFFSET, pinTarget ?? FEED_PULL_OFFSET) -
          contentHeight,
      );
      wrapper.style.paddingBottom = required > 0 ? `${required}px` : "";
      if (typeof pinTarget === "number") {
        viewport.scrollTop = pinTarget;
      }

      return contentHeight;
    };

    let previousContentHeight = syncLayout();
    if (viewport.scrollTop < FEED_PULL_OFFSET) {
      viewport.scrollTop = FEED_PULL_OFFSET;
    }
    const overflowObserver =
      typeof MutationObserver === "undefined"
        ? null
        : new MutationObserver(() => {
            if (viewport.style.overflowY !== "scroll")
              viewport.style.overflowY = "scroll";
          });
    overflowObserver?.observe(viewport, {
      attributeFilter: ["style"],
      attributes: true,
    });

    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(() => {
            const target = lockRef?.current;
            if (typeof target === "number") {
              if (target < 0) return;
              previousContentHeight = syncLayout(target);
              return;
            }
            const nextContentHeight = syncLayout();
            const contentHeightChanged =
              Math.abs(nextContentHeight - previousContentHeight) > 1;
            previousContentHeight = nextContentHeight;
            if (
              contentHeightChanged &&
              !touchActiveRef.current &&
              !wheelActiveRef.current &&
              !holdingRef.current
            ) {
              clearIdlePullState();
              restoreIdleRestOffset();
            }
          });
    resizeObserver?.observe(wrapper);

    const commitOrReset = () => {
      if (hasActiveLock()) {
        cancelPullForLock();
        return;
      }
      wheelActiveRef.current = false;
      clearTimeout(wheelTimerRef.current);
      wheelTimerRef.current = undefined;
      if (viewport.scrollTop >= FEED_PULL_OFFSET) return;
      if (committedRef.current && !disabledRef.current) {
        holdingRef.current = true;
        viewport.scrollTo({
          behavior: "smooth",
          top: FEED_PULL_OFFSET - HOLD_OFFSET,
        });
        onRefreshRef.current();
        holdTimerRef.current = setTimeout(() => {
          reset();
          viewport.scrollTo({ behavior: "smooth", top: FEED_PULL_OFFSET });
        }, HOLD_MS);
        return;
      }
      reset();
      viewport.scrollTop = FEED_PULL_OFFSET;
    };

    const scheduleWheelSettle = () => {
      startLockMonitor();
      clearTimeout(wheelTimerRef.current);
      wheelTimerRef.current = setTimeout(() => {
        const elapsed = Date.now() - lastWheelActivityAtRef.current;
        if (elapsed < WHEEL_SETTLE_MS) {
          scheduleWheelSettle();
          return;
        }
        wheelTimerRef.current = undefined;
        wheelActiveRef.current = false;
        wheelProxyPullRef.current = false;
        if (hasActiveLock() || touchActiveRef.current || holdingRef.current) {
          return;
        }
        if (viewport.scrollTop < FEED_PULL_OFFSET) {
          scheduleRelease();
        }
      }, WHEEL_SETTLE_MS);
    };

    const scheduleRelease = () => {
      startLockMonitor();
      clearTimeout(releaseTimerRef.current);
      releaseTimerRef.current = setTimeout(() => {
        releaseTimerRef.current = undefined;
        if (
          !hasActiveLock() &&
          !touchActiveRef.current &&
          !holdingRef.current
        ) {
          commitOrReset();
          return;
        }
        if (hasActiveLock()) cancelPullForLock();
      }, RELEASE_MS);
    };

    const handleScroll = () => {
      if (wheelActiveRef.current) {
        lastWheelActivityAtRef.current = Date.now();
      }
      if (hasActiveLock()) {
        cancelPullForLock();
        return;
      }
      const currentScrollTop = viewport.scrollTop;
      if (holdingRef.current) return;
      const hasInteractivePullSession =
        touchActiveRef.current ||
        wheelActiveRef.current ||
        releaseTimerRef.current !== undefined;
      if (
        !hasInteractivePullSession &&
        !pullingRef.current &&
        !committedRef.current &&
        currentScrollTop <= 1
      ) {
        clearIdlePullState();
        restoreIdleRestOffset();
        return;
      }
      if (touchActiveRef.current && !touchPullEligibleRef.current) {
        touchLastScrollTopRef.current = currentScrollTop;
        if (pullingRef.current) reset();
        return;
      }
      if (
        touchActiveRef.current &&
        touchPullEligibleRef.current &&
        !touchPullActiveRef.current
      ) {
        const pullDistance = FEED_PULL_OFFSET - currentScrollTop;
        const isPullingTowardRefresh =
          currentScrollTop < touchLastScrollTopRef.current &&
          pullDistance >= TOUCH_PULL_ACTIVATION_DISTANCE;
        touchLastScrollTopRef.current = currentScrollTop;
        if (!isPullingTowardRefresh) {
          if (pullingRef.current) reset();
          return;
        }
        touchPullActiveRef.current = true;
      }
      if (currentScrollTop >= FEED_PULL_OFFSET - PULL_BUFFER) {
        if (pullingRef.current) {
          if (wheelActiveRef.current) {
            pullingRef.current = false;
            committedRef.current = false;
            setState((current) => (current.pulling ? IDLE : current));
          } else {
            reset();
          }
        }
        return;
      }

      const readyToRefresh =
        sentinel.offsetHeight - currentScrollTop >= PULL_THRESHOLD;
      pullingRef.current = true;
      committedRef.current = readyToRefresh;
      startLockMonitor();
      setState((current) =>
        current.pulling && current.readyToRefresh === readyToRefresh
          ? current
          : { pulling: true, readyToRefresh },
      );
    };

    const handleTouchStart = () => {
      startLockMonitor();
      touchActiveRef.current = true;
      touchLastScrollTopRef.current = viewport.scrollTop;
      touchPullActiveRef.current = false;
      touchPullEligibleRef.current =
        viewport.scrollTop <= FEED_PULL_OFFSET + PULL_BUFFER;
      wheelProxyPullRef.current = false;
      lastWheelActivityAtRef.current = 0;
      clearTimeout(holdTimerRef.current);
      clearTimeout(wheelTimerRef.current);
      clearTimeout(releaseTimerRef.current);
      wheelTimerRef.current = undefined;
      wheelActiveRef.current = false;
      if (holdingRef.current) {
        reset();
        viewport.scrollTo({ behavior: "smooth", top: FEED_PULL_OFFSET });
      }
    };

    const handleWheel = (event: WheelEvent) => {
      if (hasActiveLock()) {
        cancelPullForLock();
        return;
      }
      const isNewWheelGesture = !wheelActiveRef.current;
      wheelActiveRef.current = true;
      startLockMonitor();
      clearTimeout(releaseTimerRef.current);
      releaseTimerRef.current = undefined;
      if (isNewWheelGesture) {
        wheelProxyPullRef.current = false;
      }
      lastWheelActivityAtRef.current = Date.now();

      // Desktop wheel input does not reliably move the Radix viewport into the
      // hidden pull zone even when the gesture starts from the rest offset.
      // Proxy the top-edge movement so mouse wheel and trackpad release can arm
      // the same sentinel-based refresh path as touch.
      const canProxyPull =
        event.deltaY < 0 &&
        viewport.scrollTop <= FEED_PULL_OFFSET + PULL_BUFFER;
      const canProxyRelease =
        event.deltaY > 0 &&
        wheelProxyPullRef.current &&
        viewport.scrollTop < FEED_PULL_OFFSET;
      if (canProxyPull || canProxyRelease) {
        const nextScrollTop = Math.min(
          FEED_PULL_OFFSET,
          Math.max(0, viewport.scrollTop + event.deltaY),
        );
        if (nextScrollTop !== viewport.scrollTop) {
          wheelProxyPullRef.current = true;
          viewport.scrollTop = nextScrollTop;
          viewport.dispatchEvent(new Event("scroll"));
        }
      }
      scheduleWheelSettle();
    };

    const handleTouchEnd = () => {
      const hadActiveTouchPull = touchPullActiveRef.current;
      const hadPendingPull = pullingRef.current || committedRef.current;
      touchActiveRef.current = false;
      if (hasActiveLock()) {
        cancelPullForLock();
        return;
      }
      if (!hadActiveTouchPull && !hadPendingPull) {
        touchPullEligibleRef.current = false;
        return;
      }
      scheduleRelease();
    };

    const handleTouchCancel = () => {
      touchActiveRef.current = false;
      if (hasActiveLock()) {
        cancelPullForLock();
        return;
      }
      reset();
      scheduleRelease();
    };

    const handleScrollEnd = () => {
      if (hasActiveLock()) {
        cancelPullForLock();
        return;
      }
      if (wheelActiveRef.current || releaseTimerRef.current) return;
      if (!pullingRef.current && !committedRef.current) return;
      if (!touchActiveRef.current && !holdingRef.current) commitOrReset();
    };

    viewport.addEventListener("wheel", handleWheel, { passive: true });
    viewport.addEventListener("scroll", handleScroll, { passive: true });
    viewport.addEventListener("touchstart", handleTouchStart, {
      passive: true,
    });
    viewport.addEventListener("touchend", handleTouchEnd);
    viewport.addEventListener("touchcancel", handleTouchCancel);
    viewport.addEventListener("scrollend", handleScrollEnd);

    return () => {
      viewport.removeEventListener("wheel", handleWheel);
      viewport.removeEventListener("scroll", handleScroll);
      viewport.removeEventListener("touchstart", handleTouchStart);
      viewport.removeEventListener("touchend", handleTouchEnd);
      viewport.removeEventListener("touchcancel", handleTouchCancel);
      viewport.removeEventListener("scrollend", handleScrollEnd);
      resizeObserver?.disconnect();
      overflowObserver?.disconnect();
      stopLockMonitor();
      clearGestureTimers();
      viewport.style.overscrollBehaviorY = "";
      viewport.style.overflowY = "";
      viewport.style.touchAction = "";
      sentinel.style.height = "";
      wrapper.style.paddingBottom = "";
    };
  }, [isLayoutReady, lockRef, scrollRootRef]);

  return {
    pulling: state.pulling,
    readyToRefresh: state.readyToRefresh,
    sentinelHeight: isLayoutReady ? FEED_PULL_HEIGHT : 0,
    sentinelRef,
  };
}

export function useFeedScrollLock(
  lockRef: React.RefObject<ScrollLockTarget> | undefined,
) {
  const cleanupRef = useRef<(() => void) | null>(null);
  const preExpandArticleKeyRef = useRef<null | string>(null);
  const preExpandViewport = useRef<HTMLElement | null>(null);
  const preExpandScrollTop = useRef<null | number>(null);

  const cancelLock = useCallback(() => {
    cleanupRef.current?.();
    cleanupRef.current = null;
  }, []);

  const clearPreExpandState = useCallback((clearPersisted: boolean) => {
    preExpandArticleKeyRef.current = null;
    preExpandViewport.current = null;
    preExpandScrollTop.current = null;
    if (clearPersisted) clearPersistedPreExpandScroll();
  }, []);

  /**
   * Stores the pre-expand viewport position before focus management or browser
   * auto-scrolling can shift the clicked card.
   */
  const capturePreExpandSnapshot = useCallback((articleKey: string) => {
    const article = document.querySelector<HTMLElement>(
      `[data-article-key="${escapeArticleKey(articleKey)}"]`,
    );
    const viewport =
      article?.closest<HTMLElement>("[data-radix-scroll-area-viewport]") ??
      null;
    if (!article || !viewport) return;

    preExpandArticleKeyRef.current = articleKey;
    preExpandViewport.current = viewport;
    preExpandScrollTop.current = viewport.scrollTop;
    writePersistedPreExpandScroll({
      articleKey,
      scrollTop: viewport.scrollTop,
    });
  }, []);

  const getCollapseRestoreTarget = useCallback((articleKey: string) => {
    const persisted = readPersistedPreExpandScroll(articleKey);
    return {
      scrollTop: preExpandScrollTop.current ?? persisted?.scrollTop ?? null,
      viewport:
        preExpandViewport.current ?? findArticleViewport(articleKey) ?? null,
    };
  }, []);

  useEffect(() => cancelLock, [cancelLock]);

  const activateCollapseLock = useCallback(
    (savedViewport: HTMLElement | null, savedScrollTop: null | number) => {
      cancelLock();
      const target = savedScrollTop ?? FEED_PULL_OFFSET;
      const releaseDelay = getScrollLockReleaseMs();
      let syncFrame = 0;
      clearPreExpandState(true);
      if (lockRef) lockRef.current = target;
      const syncTargetScrollTop = () => {
        if (!savedViewport) return;
        if (savedViewport.scrollTop !== target) {
          savedViewport.scrollTop = target;
        }
      };
      const scheduleTargetSync = () => {
        if (!savedViewport) return;
        syncTargetScrollTop();
        syncFrame = window.requestAnimationFrame(scheduleTargetSync);
      };
      syncTargetScrollTop();
      if (savedViewport) {
        syncFrame = window.requestAnimationFrame(scheduleTargetSync);
      }
      const timerId = window.setTimeout(() => {
        if (syncFrame !== 0) {
          window.cancelAnimationFrame(syncFrame);
          syncFrame = 0;
        }
        if (lockRef) lockRef.current = false;
      }, releaseDelay);
      cleanupRef.current = () => {
        if (syncFrame !== 0) {
          window.cancelAnimationFrame(syncFrame);
          syncFrame = 0;
        }
        window.clearTimeout(timerId);
        if (lockRef) lockRef.current = false;
      };
    },
    [cancelLock, clearPreExpandState, lockRef],
  );

  const activateExpandLock = useCallback(
    (articleKey: string) => {
      cancelLock();
      const hasPrimedSnapshot =
        preExpandArticleKeyRef.current === articleKey &&
        preExpandViewport.current !== null &&
        preExpandScrollTop.current !== null;
      if (!hasPrimedSnapshot) clearPreExpandState(false);

      const article = document.querySelector<HTMLElement>(
        `[data-article-key="${escapeArticleKey(articleKey)}"]`,
      );
      const viewport =
        article?.closest<HTMLElement>("[data-radix-scroll-area-viewport]") ??
        null;
      if (!article || !viewport) return;

      if (!hasPrimedSnapshot) {
        capturePreExpandSnapshot(articleKey);
      } else {
        preExpandViewport.current = viewport;
      }
      scrollExpandedArticleIntoView(article, viewport, FEED_PULL_OFFSET);
      if (lockRef) lockRef.current = -1;

      const release = () => {
        if (lockRef) lockRef.current = false;
      };
      const handleExpandSettled = () => {
        article.removeEventListener(
          DASHBOARD_EVENTS.ARTICLE_EXPAND_SETTLED,
          handleExpandSettled,
        );
        window.clearTimeout(fallbackId);
        window.setTimeout(release, 80);
      };
      const fallbackId = window.setTimeout(() => {
        article.removeEventListener(
          DASHBOARD_EVENTS.ARTICLE_EXPAND_SETTLED,
          handleExpandSettled,
        );
        release();
      }, getScrollLockReleaseMs());

      article.addEventListener(
        DASHBOARD_EVENTS.ARTICLE_EXPAND_SETTLED,
        handleExpandSettled,
      );
      cleanupRef.current = () => {
        article.removeEventListener(
          DASHBOARD_EVENTS.ARTICLE_EXPAND_SETTLED,
          handleExpandSettled,
        );
        window.clearTimeout(fallbackId);
        release();
      };
    },
    [cancelLock, capturePreExpandSnapshot, clearPreExpandState, lockRef],
  );

  return {
    activateCollapseLock,
    activateExpandLock,
    cancelLock,
    capturePreExpandSnapshot,
    getCollapseRestoreTarget,
    preExpandScrollTop,
    preExpandViewport,
  };
}
