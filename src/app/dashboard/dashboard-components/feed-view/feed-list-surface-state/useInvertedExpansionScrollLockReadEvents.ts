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
 * Manage the inverted expansion scroll lock read events.
 * @param options - The options used to manage the inverted expansion scroll lock read events.
 */
export function useInvertedExpansionScrollLockReadEvents(
  options: UseInvertedExpansionScrollLockReadEventsOptions,
) {
  const {
    articleFilter,
    isInvertedScrollRef,
    onClaimInvertedScrollOwnership,
    prepareInvertedUnreadRemovalScrollLock,
    scrollViewport,
  } = options;
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
 * Process the bind inverted expansion scroll lock read events.
 * @param options - The options used to process the bind inverted expansion scroll lock read events.
 * @returns The bind inverted expansion scroll lock read events.
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
 * Create the article read toggle start handler.
 * @param options - The options used to create the article read toggle start handler.
 * @returns The article read toggle start handler.
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
 * Create the mark all read start handler.
 * @param options - The options used to create the mark all read start handler.
 * @returns The mark all read start handler.
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
 * Create the read toggle intent handler.
 * @param options - The options used to create the read toggle intent handler.
 * @returns The read toggle intent handler.
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
 * Create the viewport read start handler.
 * @param options - The options used to create the viewport read start handler.
 * @returns The viewport read start handler.
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
