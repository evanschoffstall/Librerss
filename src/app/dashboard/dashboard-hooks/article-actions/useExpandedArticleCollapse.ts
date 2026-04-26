import {
  type Dispatch,
  type SetStateAction,
  useCallback,
  useLayoutEffect,
  useRef,
} from "react";

import type { Article } from "@/lib/core";

import { getArticleKey } from "@/app/dashboard/dashboard-services/article-collection";
import { type ArticleRemovalAnimationMode } from "@/app/dashboard/display-types";

/**
 * Describes the options for handle expanded article toggle.
 */
interface HandleExpandedArticleToggleOptions {
  articleFilter: UseExpandedArticleCollapseOptions["articleFilter"];
  cancelCollapseScrollRestore: UseExpandedArticleCollapseOptions["cancelCollapseScrollRestore"];
  clearRemovalAnimation: UseExpandedArticleCollapseOptions["clearRemovalAnimation"];
  collapseExpandedArticle: (
    article: Article,
    options?: {
      animationMode?: ArticleRemovalAnimationMode;
      treatAsRead?: boolean;
    },
  ) => void;
  expandedArticleKey: UseExpandedArticleCollapseOptions["expandedArticleKey"];
  hydrateArticleContent: UseExpandedArticleCollapseOptions["hydrateArticleContent"];
  markArticleReadIfNeeded: (article: Article) => Promise<void>;
  setExpandedArticleKey: UseExpandedArticleCollapseOptions["setExpandedArticleKey"];
}

/**
 * Describes the options for handle expanded swipe read.
 */
interface HandleExpandedSwipeReadOptions {
  collapseExpandedArticle: (
    article: Article,
    options?: {
      animationMode?: ArticleRemovalAnimationMode;
      treatAsRead?: boolean;
    },
  ) => void;
  markArticleReadIfNeeded: (article: Article) => Promise<void>;
}

/**
 * Describes the options for use expanded article collapse.
 */
interface UseExpandedArticleCollapseOptions {
  articleFilter: "all" | "read" | "starred" | "unread";
  cancelCollapseScrollRestore: () => void;
  cancelHydration: (articleLink: string) => void;
  clearExpandedArticleHydrationTracking: () => void;
  clearRemovalAnimation: (articleKey: string) => void;
  expandedArticleKey: null | string;
  hydrateArticleContent: (article: Article) => Promise<void>;
  restoreCollapseScrollPosition: (articleKey: string) => void;
  setArticleReadState: (
    article: Article,
    nextReadState: boolean,
    options?: { suppressErrorToast?: boolean },
  ) => Promise<boolean>;
  setExpandedArticleKey: Dispatch<SetStateAction<null | string>>;
  startRemovalAnimation: (
    article: Article,
    mode: ArticleRemovalAnimationMode,
  ) => void;
  updatingArticleState: Record<string, boolean>;
}
/**
 * Manage the expanded article collapse.
 * @param options - The options used to manage the expanded article collapse.
 * @returns The expanded article collapse state and callbacks.
 */
export function useExpandedArticleCollapse(
  options: UseExpandedArticleCollapseOptions,
) {
  const {
    articleFilter,
    cancelCollapseScrollRestore,
    cancelHydration,
    clearExpandedArticleHydrationTracking,
    clearRemovalAnimation,
    expandedArticleKey,
    hydrateArticleContent,
    restoreCollapseScrollPosition,
    setArticleReadState,
    setExpandedArticleKey,
    startRemovalAnimation,
    updatingArticleState,
  } = options;
  const queueCollapseScrollRestore = usePendingCollapseScrollRestore({
    expandedArticleKey,
    restoreCollapseScrollPosition,
  });
  const collapseExpandedArticle = useCollapseExpandedArticle({
    articleFilter,
    cancelHydration,
    clearExpandedArticleHydrationTracking,
    clearRemovalAnimation,
    queueCollapseScrollRestore,
    setExpandedArticleKey,
    startRemovalAnimation,
  });
  const markArticleReadIfNeeded = useMarkExpandedArticleReadIfNeeded({
    setArticleReadState,
    updatingArticleState,
  });
  const handleArticleToggle = useHandleExpandedArticleToggle({
    articleFilter,
    cancelCollapseScrollRestore,
    clearRemovalAnimation,
    collapseExpandedArticle,
    expandedArticleKey,
    hydrateArticleContent,
    markArticleReadIfNeeded,
    setExpandedArticleKey,
  });
  const handleExpandedSwipeRead = useHandleExpandedSwipeRead({
    collapseExpandedArticle,
    markArticleReadIfNeeded,
  });

  return {
    collapseExpandedArticle,
    handleArticleToggle,
    handleExpandedSwipeRead,
  };
}

/**
 * Manage the collapse expanded article.
 * @param options - The options used to manage the collapse expanded article.
 * @returns The collapse expanded article state and callbacks.
 */
function useCollapseExpandedArticle(
  options: Pick<
    UseExpandedArticleCollapseOptions,
    | "articleFilter"
    | "cancelHydration"
    | "clearExpandedArticleHydrationTracking"
    | "clearRemovalAnimation"
    | "setExpandedArticleKey"
    | "startRemovalAnimation"
  > & {
    queueCollapseScrollRestore: (articleKey: string) => void;
  },
) {
  const {
    articleFilter,
    cancelHydration,
    clearExpandedArticleHydrationTracking,
    clearRemovalAnimation,
    queueCollapseScrollRestore,
    setExpandedArticleKey,
    startRemovalAnimation,
  } = options;
  return useCallback(
    (
      article: Article,
      options?: {
        animationMode?: ArticleRemovalAnimationMode;
        treatAsRead?: boolean;
      },
    ) => {
      const articleKey = getArticleKey(article);
      if (options?.treatAsRead && articleFilter === "unread") {
        startRemovalAnimation(article, options.animationMode ?? "de-expanding");
      } else {
        clearRemovalAnimation(articleKey);
      }

      queueCollapseScrollRestore(articleKey);
      setExpandedArticleKey((current) =>
        current === articleKey ? null : current,
      );
      clearExpandedArticleHydrationTracking();
      const link = article.link.trim();
      if (link) {
        cancelHydration(link);
      }
    },
    [
      articleFilter,
      cancelHydration,
      clearExpandedArticleHydrationTracking,
      clearRemovalAnimation,
      queueCollapseScrollRestore,
      setExpandedArticleKey,
      startRemovalAnimation,
    ],
  );
}
/**
 * Manage the handle expanded article toggle.
 * @param options - The options used to manage the handle expanded article toggle.
 * @returns The handle expanded article toggle state and callbacks.
 */
function useHandleExpandedArticleToggle(
  options: HandleExpandedArticleToggleOptions,
) {
  const {
    articleFilter,
    cancelCollapseScrollRestore,
    clearRemovalAnimation,
    collapseExpandedArticle,
    expandedArticleKey,
    hydrateArticleContent,
    markArticleReadIfNeeded,
    setExpandedArticleKey,
  } = options;
  return useCallback(
    async (
      article: Article,
      markExpandedArticleHydrationHandled: (articleKey: string) => void,
    ) => {
      const nextArticleKey = getArticleKey(article);
      if (expandedArticleKey === nextArticleKey) {
        collapseExpandedArticle(article, {
          treatAsRead: articleFilter === "unread",
        });
        return;
      }

      clearRemovalAnimation(nextArticleKey);
      cancelCollapseScrollRestore();
      // Guard the restore effect before the state update so it sees the ref
      // already set on the render that follows setExpandedArticleKey. Start
      // hydration in that same synchronous turn so the expanded render receives
      // a hydrating article link immediately instead of briefly revealing the
      // feed excerpt before the skeleton state arrives.
      markExpandedArticleHydrationHandled(nextArticleKey);
      const hydrationPromise = hydrateArticleContent(article);
      setExpandedArticleKey((current) =>
        current === nextArticleKey ? null : nextArticleKey,
      );
      await markArticleReadIfNeeded(article);
      await hydrationPromise;
    },
    [
      articleFilter,
      cancelCollapseScrollRestore,
      clearRemovalAnimation,
      collapseExpandedArticle,
      expandedArticleKey,
      hydrateArticleContent,
      markArticleReadIfNeeded,
      setExpandedArticleKey,
    ],
  );
}

/**
 * Manage the handle expanded swipe read.
 * @param options - The options used to manage the handle expanded swipe read.
 * @returns The handle expanded swipe read state and callbacks.
 */
function useHandleExpandedSwipeRead(options: HandleExpandedSwipeReadOptions) {
  const { collapseExpandedArticle, markArticleReadIfNeeded } = options;
  return useCallback(
    async (article: Article) => {
      await markArticleReadIfNeeded(article);
      collapseExpandedArticle(article, {
        animationMode: "swipe-read",
        treatAsRead: true,
      });
    },
    [collapseExpandedArticle, markArticleReadIfNeeded],
  );
}

/**
 * Manage the mark expanded article read if needed.
 * @param options - The options used to manage the mark expanded article read if needed.
 * @returns The mark expanded article read if needed state and callbacks.
 */
function useMarkExpandedArticleReadIfNeeded(
  options: Pick<
    UseExpandedArticleCollapseOptions,
    "setArticleReadState" | "updatingArticleState"
  >,
) {
  const { setArticleReadState, updatingArticleState } = options;
  return useCallback(
    async (article: Article) => {
      const articleKey = getArticleKey(article);
      if (!article.isRead && !updatingArticleState[articleKey]) {
        await setArticleReadState(article, true, { suppressErrorToast: true });
      }
    },
    [setArticleReadState, updatingArticleState],
  );
}

/**
 * Manage the pending collapse scroll restore.
 * @param options - The options used to manage the pending collapse scroll restore.
 * @returns The pending collapse scroll restore state and callbacks.
 */
function usePendingCollapseScrollRestore(
  options: Pick<
    UseExpandedArticleCollapseOptions,
    "expandedArticleKey" | "restoreCollapseScrollPosition"
  >,
) {
  const { expandedArticleKey, restoreCollapseScrollPosition } = options;
  const pendingCollapseRestoreKeyRef = useRef<null | string>(null);

  useLayoutEffect(() => {
    const pendingCollapseRestoreKey = pendingCollapseRestoreKeyRef.current;

    if (!pendingCollapseRestoreKey || expandedArticleKey !== null) {
      return;
    }

    pendingCollapseRestoreKeyRef.current = null;
    restoreCollapseScrollPosition(pendingCollapseRestoreKey);
  }, [expandedArticleKey, restoreCollapseScrollPosition]);

  return useCallback((articleKey: string) => {
    pendingCollapseRestoreKeyRef.current = articleKey;
  }, []);
}
