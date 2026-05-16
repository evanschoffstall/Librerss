"use client";

import type React from "react";

import { useCallback } from "react";
import { toast } from "sonner";

import type { Article } from "@/lib/core";

import {
  type ArticleStatusMutationController,
  type ArticleStatusMutationVersionTracker,
  createSettledArticleStatusMutationGuard,
  runOptimisticArticleStatusMutation,
  useArticleMutationTracker,
  useArticleStatusMutationVersions,
} from "@/app/dashboard/dashboard-hooks/article-actions";
import { getArticleKey } from "@/app/dashboard/dashboard-services/article-collection";

/**
 * Inputs needed to run a guarded batch read-state mutation.
 */
interface ReadStateMutationOptions {
  articles: Article[];
  createMutationSignalHandle?: ArticleStatusMutationController["createMutationSignalHandle"];
  mutationTracker: ReturnType<typeof useArticleMutationTracker>;
  mutationVersions: ArticleStatusMutationVersionTracker;
  nextReadState: boolean;
  options?: SetReadStateOptions;
  setFeed: React.Dispatch<React.SetStateAction<Article[]>>;
  usePlaceholderData: boolean;
}

/**
 * Describes the options for set read state.
 */
interface SetReadStateOptions {
  suppressErrorToast?: boolean;
}

/**
 * Describes the options for use article read state.
 */
interface UseArticleReadStateOptions {
  createMutationSignalHandle?: ArticleStatusMutationController["createMutationSignalHandle"];
  setFeed: React.Dispatch<React.SetStateAction<Article[]>>;
  usePlaceholderData?: boolean;
}

/**
 * Manage the article read state.
 * @param options - The options used to manage the article read state.
 * @returns The article read state state and callbacks.
 */
export function useArticleReadState(options: UseArticleReadStateOptions) {
  const {
    createMutationSignalHandle,
    setFeed,
    usePlaceholderData = false,
  } = options;
  const mutationTracker = useArticleMutationTracker();
  const mutationVersions = useArticleStatusMutationVersions();

  const setArticlesReadState = useCallback(
    async (
      articles: Article[],
      nextReadState: boolean,
      options?: SetReadStateOptions,
    ) => {
      return await runReadStateMutation({
        articles,
        createMutationSignalHandle,
        mutationTracker,
        mutationVersions,
        nextReadState,
        options,
        setFeed,
        usePlaceholderData,
      });
    },
    [
      createMutationSignalHandle,
      mutationTracker,
      mutationVersions,
      setFeed,
      usePlaceholderData,
    ],
  );
  const { handleToggleReadState, setArticleReadState } =
    useSingleArticleReadStateActions(setArticlesReadState);

  return {
    clearUpdatingArticleKeys: mutationTracker.clearUpdatingArticleKeys,
    handleToggleReadState,
    markUpdatingArticleKeys: mutationTracker.markUpdatingArticleKeys,
    mutationTracker,
    setArticleReadState,
    setArticlesReadState,
    updatingArticleState: mutationTracker.updatingArticleState,
  };
}

/**
 * Apply a requested read state to every matching article in the current feed.
 * @param currentFeed - Feed snapshot currently mounted in state.
 * @param articleMap - Articles whose read state should change.
 * @param nextReadState - Read-state value to apply.
 * @returns Feed snapshot with matching articles updated.
 */
function applyOptimisticReadState(
  currentFeed: Article[],
  articleMap: Map<string, Article>,
  nextReadState: boolean,
) {
  return currentFeed.map((feedArticle) => {
    const articleKey = getArticleKey(feedArticle);
    return articleMap.has(articleKey)
      ? { ...feedArticle, isRead: nextReadState }
      : feedArticle;
  });
}

/**
 * Create the shared optimistic mutation options for a read-state batch.
 * @param mutationOptions - Read-state mutation inputs and ownership helpers.
 * @param articleVersions - Local mutation versions captured for this batch.
 * @returns Options consumed by the shared optimistic status mutation runner.
 */
function createReadStateMutationOptions(
  mutationOptions: ReadStateMutationOptions,
  articleVersions: ReadonlyMap<string, number>,
) {
  return {
    /**
     * Apply the requested read state to matching rows in the current feed window.
     * @param currentFeed - Feed snapshot currently mounted in state.
     * @param articleMap - Articles captured when the mutation started.
     * @returns Feed snapshot with matching rows set to the requested read state.
     */
    applyOptimisticUpdate: (
      currentFeed: Article[],
      articleMap: Map<string, Article>,
    ) =>
      applyOptimisticReadState(
        currentFeed,
        articleMap,
        mutationOptions.nextReadState,
      ),
    articles: mutationOptions.articles,
    createMutationSignalHandle: mutationOptions.createMutationSignalHandle,
    errorLogLabel: "Set read state error",
    mutationTracker: mutationOptions.mutationTracker,
    /**
     * Show the read-state failure toast unless this batch caller suppresses it.
     */
    onError: () => {
      showReadStateError(mutationOptions.options);
    },
    /**
     * Restore original read state only for failed articles still owned by this mutation.
     * @param currentFeed - Feed snapshot currently mounted in state.
     * @param articleMap - Original article state captured before the optimistic update.
     * @param failedArticleKeys - Failed article keys that may be restored.
     * @returns Feed snapshot with failed article rows restored.
     */
    restoreUpdate: (
      currentFeed: Article[],
      articleMap: Map<string, Article>,
      failedArticleKeys?: Set<string>,
    ) => restoreArticleReadState(currentFeed, articleMap, failedArticleKeys),
    setFeed: mutationOptions.setFeed,
    shouldApplySettledUpdate: createSettledArticleStatusMutationGuard(
      mutationOptions.mutationVersions,
      articleVersions,
    ),
    /**
     * Create the persisted read-state patch for each article in the batch.
     * @returns Article status patch sent to the API.
     */
    statusPatchForArticle: () => ({ isRead: mutationOptions.nextReadState }),
    usePlaceholderData: mutationOptions.usePlaceholderData,
  };
}

/**
 * Restore original read state for failed article-status writes.
 * @param currentFeed - Feed snapshot currently mounted in state.
 * @param articleMap - Original articles captured before the optimistic update.
 * @param failedArticleKeys - Failed article keys to restore; restores all captured articles when omitted.
 * @returns Feed snapshot with failed articles restored.
 */
function restoreArticleReadState(
  currentFeed: Article[],
  articleMap: Map<string, Article>,
  failedArticleKeys?: Set<string>,
) {
  return currentFeed.map((feedArticle) => {
    const articleKey = getArticleKey(feedArticle);
    const originalArticle = articleMap.get(articleKey);
    const shouldRestore =
      !failedArticleKeys || failedArticleKeys.has(articleKey);
    return shouldRestore && originalArticle
      ? { ...feedArticle, isRead: originalArticle.isRead }
      : feedArticle;
  });
}

/**
 * Run a read-state mutation and release its local mutation versions when done.
 * @param mutationOptions - Read-state mutation inputs and ownership helpers.
 * @returns Number of articles successfully persisted.
 */
async function runReadStateMutation(mutationOptions: ReadStateMutationOptions) {
  const articleVersions =
    mutationOptions.mutationVersions.trackArticleMutationVersions(
      mutationOptions.articles,
    );

  try {
    const result = await runOptimisticArticleStatusMutation(
      createReadStateMutationOptions(mutationOptions, articleVersions),
    );

    return result.attemptedCount - result.failedArticleKeys.size;
  } finally {
    mutationOptions.mutationVersions.releaseArticleMutationVersions(
      articleVersions,
    );
  }
}

/**
 * Show read-state mutation feedback when the caller has not suppressed toasts.
 * @param options - Batch options controlling user-facing error feedback.
 */
function showReadStateError(options?: SetReadStateOptions) {
  if (!options?.suppressErrorToast) {
    toast.error("Unable to update read state right now.");
  }
}

/**
 * Manage the single-article read-state callbacks built on top of the batched mutation helper.
 * @param setArticlesReadState - The batched read-state mutation callback.
 * @returns The single-article read callbacks.
 */
function useSingleArticleReadStateActions(
  setArticlesReadState: (
    articles: Article[],
    nextReadState: boolean,
    options?: SetReadStateOptions,
  ) => Promise<number>,
) {
  const setArticleReadState = useCallback(
    async (
      article: Article,
      nextReadState: boolean,
      options?: SetReadStateOptions,
    ) => {
      return (
        (await setArticlesReadState([article], nextReadState, options)) === 1
      );
    },
    [setArticlesReadState],
  );
  const handleToggleReadState = useCallback(
    async (article: Article) => {
      await setArticleReadState(article, !article.isRead);
    },
    [setArticleReadState],
  );

  return { handleToggleReadState, setArticleReadState };
}
