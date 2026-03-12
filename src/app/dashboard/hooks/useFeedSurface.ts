"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { escapeArticleKey } from "./useArticleHydration";

export const FEED_PULL_HEIGHT = 104;
export const FEED_PULL_OFFSET = 110;

const PULL_BUFFER = 8;
const PULL_THRESHOLD = 56;
const HOLD_OFFSET = 44;
const HOLD_MS = 650;
const RELEASE_MS = 200;
const LOCK_RELEASE_BUFFER_MS = 80;
const LOCK_RELEASE_FALLBACK_MS = 320;
const PRE_EXPAND_SCROLL_SESSION_KEY = "librerss:article-pre-expand-scroll";

interface PersistedPreExpandScroll {
  articleKey: string;
  scrollTop: number;
}

interface PullState {
  pulling: boolean;
  readyToRefresh: boolean;
}

type ScrollLockTarget = false | number;

const IDLE: PullState = { pulling: false, readyToRefresh: false };

export function useFeedPullOffset() {
  return FEED_PULL_OFFSET;
}

export function useFeedPullRefresh(
  scrollRootRef: React.RefObject<HTMLElement | null>,
  onRefresh: () => void,
  disabled = false,
  lockRef?: React.RefObject<ScrollLockTarget>,
) {
  const [state, setState] = useState(IDLE);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const touchActiveRef = useRef(false);
  const pullingRef = useRef(false);
  const holdingRef = useRef(false);
  const committedRef = useRef(false);
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const releaseTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(
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
    const wrapper = sentinel?.parentElement;
    if (!sentinel || !wrapper) return;

    const reset = () => {
      pullingRef.current = false;
      holdingRef.current = false;
      committedRef.current = false;
      clearTimeout(holdTimerRef.current);
      clearTimeout(releaseTimerRef.current);
      holdTimerRef.current = undefined;
      releaseTimerRef.current = undefined;
      setState(IDLE);
    };

    const syncLayout = (pinTarget?: number) => {
      viewport.style.overscrollBehaviorY = "none";
      viewport.style.overflowY = "scroll";
      sentinel.style.height = `${FEED_PULL_HEIGHT}px`;
      const currentPad = parseFloat(wrapper.style.paddingBottom) || 0;
      const contentHeight = wrapper.offsetHeight - currentPad;
      const required = Math.max(
        0,
        viewport.clientHeight +
          Math.max(FEED_PULL_HEIGHT, pinTarget ?? FEED_PULL_HEIGHT) -
          contentHeight,
      );
      wrapper.style.paddingBottom = required > 0 ? `${required}px` : "";
      if (typeof pinTarget === "number") {
        viewport.scrollTop = pinTarget;
      } else if (
        !touchActiveRef.current &&
        !holdingRef.current &&
        !pullingRef.current &&
        viewport.scrollTop < FEED_PULL_OFFSET
      ) {
        viewport.scrollTop = FEED_PULL_OFFSET;
      }
    };

    syncLayout();
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
              syncLayout(target);
              return;
            }
            syncLayout();
          });
    resizeObserver?.observe(wrapper);

    const commitOrReset = () => {
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

    const scheduleRelease = () => {
      clearTimeout(releaseTimerRef.current);
      releaseTimerRef.current = setTimeout(() => {
        releaseTimerRef.current = undefined;
        if (!touchActiveRef.current && !holdingRef.current) commitOrReset();
      }, RELEASE_MS);
    };

    const handleScroll = () => {
      if (typeof lockRef?.current === "number") return;
      if (viewport.scrollTop < 0) {
        viewport.scrollTop = 0;
        return;
      }
      if (holdingRef.current) return;
      if (viewport.scrollTop >= FEED_PULL_OFFSET - PULL_BUFFER) {
        if (pullingRef.current) reset();
        return;
      }

      const readyToRefresh =
        sentinel.offsetHeight - viewport.scrollTop >= PULL_THRESHOLD;
      pullingRef.current = true;
      committedRef.current = readyToRefresh;
      setState((current) =>
        current.pulling && current.readyToRefresh === readyToRefresh
          ? current
          : { pulling: true, readyToRefresh },
      );
    };

    const handleTouchStart = () => {
      touchActiveRef.current = true;
      clearTimeout(holdTimerRef.current);
      clearTimeout(releaseTimerRef.current);
      if (holdingRef.current) {
        reset();
        viewport.scrollTo({ behavior: "smooth", top: FEED_PULL_OFFSET });
      }
    };

    const handleTouchEnd = () => {
      touchActiveRef.current = false;
      if (committedRef.current && !disabledRef.current) {
        commitOrReset();
        return;
      }
      scheduleRelease();
    };

    const handleTouchCancel = () => {
      touchActiveRef.current = false;
      reset();
      scheduleRelease();
    };

    const handleScrollEnd = () => {
      if (typeof lockRef?.current === "number") return;
      if (!touchActiveRef.current && !holdingRef.current) commitOrReset();
    };

    viewport.addEventListener("scroll", handleScroll, { passive: true });
    viewport.addEventListener("touchstart", handleTouchStart, {
      passive: true,
    });
    viewport.addEventListener("touchend", handleTouchEnd);
    viewport.addEventListener("touchcancel", handleTouchCancel);
    viewport.addEventListener("scrollend", handleScrollEnd);

    return () => {
      viewport.removeEventListener("scroll", handleScroll);
      viewport.removeEventListener("touchstart", handleTouchStart);
      viewport.removeEventListener("touchend", handleTouchEnd);
      viewport.removeEventListener("touchcancel", handleTouchCancel);
      viewport.removeEventListener("scrollend", handleScrollEnd);
      resizeObserver?.disconnect();
      overflowObserver?.disconnect();
      clearTimeout(holdTimerRef.current);
      clearTimeout(releaseTimerRef.current);
      viewport.style.overscrollBehaviorY = "";
      viewport.style.overflowY = "";
      sentinel.style.height = "";
      wrapper.style.paddingBottom = "";
    };
  }, [lockRef, scrollRootRef]);

  return {
    pulling: state.pulling,
    readyToRefresh: state.readyToRefresh,
    sentinelHeight: FEED_PULL_HEIGHT,
    sentinelRef,
  };
}

export function useFeedScrollLock(
  lockRef: React.RefObject<ScrollLockTarget> | undefined,
) {
  const cleanupRef = useRef<(() => void) | null>(null);
  const preExpandViewport = useRef<HTMLElement | null>(null);
  const preExpandScrollTop = useRef<null | number>(null);

  const cancelLock = useCallback(() => {
    cleanupRef.current?.();
    cleanupRef.current = null;
  }, []);

  const clearPreExpandState = useCallback((clearPersisted: boolean) => {
    preExpandViewport.current = null;
    preExpandScrollTop.current = null;
    if (clearPersisted) clearPersistedPreExpandScroll();
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
      const target = savedScrollTop ?? FEED_PULL_HEIGHT;
      const releaseDelay = getScrollLockReleaseMs();
      clearPreExpandState(true);
      if (lockRef) lockRef.current = target;
      if (savedViewport) savedViewport.scrollTop = target;
      const timerId = window.setTimeout(() => {
        if (lockRef) lockRef.current = false;
      }, releaseDelay);
      cleanupRef.current = () => {
        window.clearTimeout(timerId);
        if (lockRef) lockRef.current = false;
      };
    },
    [cancelLock, clearPreExpandState, lockRef],
  );

  const activateExpandLock = useCallback(
    (articleKey: string) => {
      cancelLock();
      clearPreExpandState(false);

      const article = document.querySelector<HTMLElement>(
        `[data-article-key="${escapeArticleKey(articleKey)}"]`,
      );
      const viewport =
        article?.closest<HTMLElement>("[data-radix-scroll-area-viewport]") ??
        null;
      if (!article || !viewport) return;

      preExpandViewport.current = viewport;
      preExpandScrollTop.current = viewport.scrollTop;
      writePersistedPreExpandScroll({
        articleKey,
        scrollTop: viewport.scrollTop,
      });
      if (lockRef) lockRef.current = -1;

      const release = () => {
        if (lockRef) lockRef.current = false;
      };
      const handleTransitionEnd = (event: TransitionEvent) => {
        if (event.propertyName !== "max-height") return;
        article.removeEventListener("transitionend", handleTransitionEnd);
        window.clearTimeout(fallbackId);
        window.setTimeout(release, 80);
      };
      const fallbackId = window.setTimeout(() => {
        article.removeEventListener("transitionend", handleTransitionEnd);
        release();
      }, 3000);

      article.addEventListener("transitionend", handleTransitionEnd);
      cleanupRef.current = () => {
        article.removeEventListener("transitionend", handleTransitionEnd);
        window.clearTimeout(fallbackId);
        release();
      };
    },
    [cancelLock, clearPreExpandState, lockRef],
  );

  return {
    activateCollapseLock,
    activateExpandLock,
    cancelLock,
    getCollapseRestoreTarget,
    preExpandScrollTop,
    preExpandViewport,
  };
}

function clearPersistedPreExpandScroll() {
  const storage = getSessionStorage();
  if (!storage) return;
  try {
    storage.removeItem(PRE_EXPAND_SCROLL_SESSION_KEY);
  } catch {
    return undefined;
  }
}

function findArticleViewport(articleKey: string) {
  try {
    const article = document.querySelector<HTMLElement>(
      `[data-article-key="${escapeArticleKey(articleKey)}"]`,
    );

    return (
      article?.closest<HTMLElement>("[data-radix-scroll-area-viewport]") ?? null
    );
  } catch {
    return null;
  }
}

function getScrollLockReleaseMs() {
  if (typeof window === "undefined" || typeof getComputedStyle !== "function") {
    return LOCK_RELEASE_FALLBACK_MS;
  }

  const duration =
    parseCssDurationMs(
      document.body.style.getPropertyValue("--motion-duration-expand"),
    ) ??
    parseCssDurationMs(
      getComputedStyle(document.body).getPropertyValue(
        "--motion-duration-expand",
      ),
    ) ??
    parseCssDurationMs(
      getComputedStyle(document.documentElement).getPropertyValue(
        "--motion-duration-expand",
      ),
    );
  return duration === null
    ? LOCK_RELEASE_FALLBACK_MS
    : duration + LOCK_RELEASE_BUFFER_MS;
}

function getSessionStorage() {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

function isPersistedPreExpandScroll(
  value: unknown,
): value is PersistedPreExpandScroll {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<PersistedPreExpandScroll>;
  return (
    typeof candidate.articleKey === "string" &&
    Number.isFinite(candidate.scrollTop)
  );
}

function parseCssDurationMs(value: string) {
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;

  if (trimmed.endsWith("ms")) {
    const parsed = Number.parseFloat(trimmed.slice(0, -2));
    return Number.isFinite(parsed) ? parsed : null;
  }

  if (trimmed.endsWith("s")) {
    const parsed = Number.parseFloat(trimmed.slice(0, -1));
    return Number.isFinite(parsed) ? parsed * 1000 : null;
  }

  const parsed = Number.parseFloat(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function readPersistedPreExpandScroll(
  articleKey: string,
): null | PersistedPreExpandScroll {
  const storage = getSessionStorage();
  if (!storage) return null;
  try {
    const raw = storage.getItem(PRE_EXPAND_SCROLL_SESSION_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isPersistedPreExpandScroll(parsed)) return null;
    return parsed.articleKey === articleKey ? parsed : null;
  } catch {
    return null;
  }
}

function writePersistedPreExpandScroll(saved: PersistedPreExpandScroll) {
  const storage = getSessionStorage();
  if (!storage) return;
  try {
    storage.setItem(PRE_EXPAND_SCROLL_SESSION_KEY, JSON.stringify(saved));
  } catch {
    return undefined;
  }
}
