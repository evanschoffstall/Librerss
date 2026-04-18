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
 * Coordinates expanded-row collapse and expansion transitions.
 *
 * This keeps the expanded-row lifecycle together so the top-level article
 * actions hook can compose read-state, hydration, and star-state mutations
 * without carrying the expansion orchestration inline.
 * @param root0
 * @param root0.articleFilter
 * @param root0.cancelCollapseScrollRestore
 * @param root0.cancelHydration
 * @param root0.clearExpandedArticleHydrationTracking
 * @param root0.clearRemovalAnimation
 * @param root0.expandedArticleKey
 * @param root0.hydrateArticleContent
 * @param root0.restoreCollapseScrollPosition
 * @param root0.setArticleReadState
 * @param root0.setExpandedArticleKey
 * @param root0.startRemovalAnimation
 * @param root0.updatingArticleState
 */
export function useExpandedArticleCollapse({
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
}: UseExpandedArticleCollapseOptions) {
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
 * @param root0
 * @param root0.articleFilter
 * @param root0.cancelHydration
 * @param root0.clearExpandedArticleHydrationTracking
 * @param root0.clearRemovalAnimation
 * @param root0.queueCollapseScrollRestore
 * @param root0.setExpandedArticleKey
 * @param root0.startRemovalAnimation
 */
function useCollapseExpandedArticle({
  articleFilter,
  cancelHydration,
  clearExpandedArticleHydrationTracking,
  clearRemovalAnimation,
  queueCollapseScrollRestore,
  setExpandedArticleKey,
  startRemovalAnimation,
}: Pick<
  UseExpandedArticleCollapseOptions,
  | "articleFilter"
  | "cancelHydration"
  | "clearExpandedArticleHydrationTracking"
  | "clearRemovalAnimation"
  | "setExpandedArticleKey"
  | "startRemovalAnimation"
> & {
  queueCollapseScrollRestore: (articleKey: string) => void;
}) {
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
 * @param root0
 * @param root0.articleFilter
 * @param root0.cancelCollapseScrollRestore
 * @param root0.clearRemovalAnimation
 * @param root0.collapseExpandedArticle
 * @param root0.expandedArticleKey
 * @param root0.hydrateArticleContent
 * @param root0.markArticleReadIfNeeded
 * @param root0.setExpandedArticleKey
 */
function useHandleExpandedArticleToggle({
  articleFilter,
  cancelCollapseScrollRestore,
  clearRemovalAnimation,
  collapseExpandedArticle,
  expandedArticleKey,
  hydrateArticleContent,
  markArticleReadIfNeeded,
  setExpandedArticleKey,
}: {
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
}) {
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
      // Guard the restore effect BEFORE the state update so it sees the ref
      // already set on the render that follows setExpandedArticleKey. Without
      // this ordering the restore effect fires with autoHydratedExpandedKeyRef
      // still null and starts hydration #1, and the explicit call below then
      // starts hydration #2 once markArticleReadIfNeeded resolves — producing
      // the skeleton → text → skeleton → text flash for extraction-disabled
      // articles whose stored-content fetch returns null.
      markExpandedArticleHydrationHandled(nextArticleKey);
      setExpandedArticleKey((current) =>
        current === nextArticleKey ? null : nextArticleKey,
      );
      await markArticleReadIfNeeded(article);
      await hydrateArticleContent(article);
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
 * @param root0
 * @param root0.collapseExpandedArticle
 * @param root0.markArticleReadIfNeeded
 */
function useHandleExpandedSwipeRead({
  collapseExpandedArticle,
  markArticleReadIfNeeded,
}: {
  collapseExpandedArticle: (
    article: Article,
    options?: {
      animationMode?: ArticleRemovalAnimationMode;
      treatAsRead?: boolean;
    },
  ) => void;
  markArticleReadIfNeeded: (article: Article) => Promise<void>;
}) {
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
 * @param root0
 * @param root0.setArticleReadState
 * @param root0.updatingArticleState
 */
function useMarkExpandedArticleReadIfNeeded({
  setArticleReadState,
  updatingArticleState,
}: Pick<
  UseExpandedArticleCollapseOptions,
  "setArticleReadState" | "updatingArticleState"
>) {
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
 * Defers collapse scroll restoration until the collapsed DOM state is committed.
 *
 * Restoring during the click handler can be overwritten while the expanded row
 * is still mounted, especially after hydration grows the article and the user
 * collapses from deep inside the content body.
 * @param root0
 * @param root0.expandedArticleKey
 * @param root0.restoreCollapseScrollPosition
 */
function usePendingCollapseScrollRestore({
  expandedArticleKey,
  restoreCollapseScrollPosition,
}: Pick<
  UseExpandedArticleCollapseOptions,
  "expandedArticleKey" | "restoreCollapseScrollPosition"
>) {
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
