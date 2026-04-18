import { useEffect } from "react";

import {
  collectFullyVisibleArticleKeys,
  readPreparedArticleKey,
} from "@/app/dashboard/dashboard-components/feed-view/feed-list-surface-state/view-core";
import { DASHBOARD_EVENTS } from "@/app/dashboard/dashboard-services/dashboard-constants";

interface UseInvertedExpansionScrollLockReadEventsOptions {
  articleFilter: string;
  isInvertedScrollRef: React.RefObject<boolean>;
  onClaimInvertedScrollOwnership: () => void;
  prepareInvertedUnreadRemovalScrollLock: (
    articleKeys: Iterable<string>,
    options?: { primeInteraction?: boolean },
  ) => void;
  scrollViewport: HTMLElement | null;
}

/**
 * @param root0
 * @param root0.articleFilter
 * @param root0.isInvertedScrollRef
 * @param root0.onClaimInvertedScrollOwnership
 * @param root0.prepareInvertedUnreadRemovalScrollLock
 * @param root0.scrollViewport
 */
export function useInvertedExpansionScrollLockReadEvents({
  articleFilter,
  isInvertedScrollRef,
  onClaimInvertedScrollOwnership,
  prepareInvertedUnreadRemovalScrollLock,
  scrollViewport,
}: UseInvertedExpansionScrollLockReadEventsOptions) {
  useEffect(() => {
    return bindInvertedExpansionScrollLockReadEvents({
      articleFilter,
      isInvertedScrollRef,
      onClaimInvertedScrollOwnership,
      prepareInvertedUnreadRemovalScrollLock,
      scrollViewport,
    });
  }, [
    articleFilter,
    isInvertedScrollRef,
    onClaimInvertedScrollOwnership,
    prepareInvertedUnreadRemovalScrollLock,
    scrollViewport,
  ]);
}

/**
 * @param options
 */
function bindInvertedExpansionScrollLockReadEvents(
  options: UseInvertedExpansionScrollLockReadEventsOptions,
) {
  const scrollViewport = options.scrollViewport;
  if (!scrollViewport) {
    return;
  }

  const handleReadToggleIntent = createReadToggleIntentHandler(options);
  const handleViewportReadStart = createViewportReadStartHandler(options);
  const handleMarkAllReadStart = createMarkAllReadStartHandler(options);
  const handleArticleReadToggleStart =
    createArticleReadToggleStartHandler(options);

  scrollViewport.addEventListener("pointerdown", handleReadToggleIntent, {
    capture: true,
    passive: true,
  });
  window.addEventListener(
    DASHBOARD_EVENTS.ARTICLE_READ_TOGGLE_START,
    handleArticleReadToggleStart,
  );
  window.addEventListener(
    DASHBOARD_EVENTS.MARK_VIEWPORT_READ_START,
    handleViewportReadStart,
  );
  window.addEventListener(
    DASHBOARD_EVENTS.MARK_ALL_READ_START,
    handleMarkAllReadStart,
  );

  return () => {
    scrollViewport.removeEventListener(
      "pointerdown",
      handleReadToggleIntent,
      true,
    );
    window.removeEventListener(
      DASHBOARD_EVENTS.ARTICLE_READ_TOGGLE_START,
      handleArticleReadToggleStart,
    );
    window.removeEventListener(
      DASHBOARD_EVENTS.MARK_VIEWPORT_READ_START,
      handleViewportReadStart,
    );
    window.removeEventListener(
      DASHBOARD_EVENTS.MARK_ALL_READ_START,
      handleMarkAllReadStart,
    );
  };
}

/**
 * @param options
 */
function createArticleReadToggleStartHandler(
  options: UseInvertedExpansionScrollLockReadEventsOptions,
) {
  return (event: Event) => {
    if (
      !options.isInvertedScrollRef.current ||
      options.articleFilter !== "unread"
    ) {
      return;
    }

    const articleKey = readPreparedArticleKey(event);
    if (!articleKey) {
      options.onClaimInvertedScrollOwnership();
      return;
    }

    options.prepareInvertedUnreadRemovalScrollLock([articleKey], {
      primeInteraction: true,
    });
  };
}

/**
 * @param options
 */
function createMarkAllReadStartHandler(
  options: UseInvertedExpansionScrollLockReadEventsOptions,
) {
  return () => {
    if (options.isInvertedScrollRef.current) {
      options.onClaimInvertedScrollOwnership();
    }
  };
}

/**
 * @param options
 */
function createReadToggleIntentHandler(
  options: UseInvertedExpansionScrollLockReadEventsOptions,
) {
  return (event: Event) => {
    if (
      !options.isInvertedScrollRef.current ||
      options.articleFilter !== "unread"
    ) {
      return;
    }

    const interactionTarget = event.target;
    if (!(interactionTarget instanceof Element)) {
      return;
    }

    const articleKey = interactionTarget
      .closest<HTMLButtonElement>("button[aria-label='Mark as read']")
      ?.closest<HTMLElement>("article[data-article-key]")?.dataset.articleKey;

    if (articleKey) {
      options.prepareInvertedUnreadRemovalScrollLock([articleKey], {
        primeInteraction: true,
      });
    }
  };
}

/**
 * @param options
 */
function createViewportReadStartHandler(
  options: UseInvertedExpansionScrollLockReadEventsOptions,
) {
  return () => {
    const scrollViewport = options.scrollViewport;
    if (
      !options.isInvertedScrollRef.current ||
      options.articleFilter !== "unread" ||
      !scrollViewport
    ) {
      return;
    }

    options.prepareInvertedUnreadRemovalScrollLock(
      collectFullyVisibleArticleKeys(scrollViewport),
      { primeInteraction: true },
    );
  };
}
