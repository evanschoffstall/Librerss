import { type Dispatch, type SetStateAction, useCallback } from "react";
import { toast } from "sonner";

import type { Article } from "@/lib/core";

import {
  type ArticleMutationTracker,
  type ArticleStatusMutationController,
  type ArticleStatusMutationVersionTracker,
  createSettledArticleStatusMutationGuard,
  runOptimisticArticleStatusMutation,
  useArticleStatusMutationVersions,
} from "@/app/dashboard/hooks/article-actions/articleStatusMutation";
import { getArticleKey } from "@/app/dashboard/services/article-collection";

/**
 * Inputs needed to run a guarded starred-state mutation.
 */
interface StarredStateMutationOptions extends UseArticleStarredStateOptions {
  article: Article;
  mutationVersions: ArticleStatusMutationVersionTracker;
  nextStarredState: boolean;
}

/**
 * Describes the options for use article starred state.
 */
interface UseArticleStarredStateOptions {
  articleFilter: "all" | "read" | "starred" | "unread";
  createMutationSignalHandle?: ArticleStatusMutationController["createMutationSignalHandle"];
  mutationTracker: Pick<
    ArticleMutationTracker,
    "clearUpdatingArticleKeys" | "markUpdatingArticleKeys"
  >;
  setFeed: Dispatch<SetStateAction<Article[]>>;
  usePlaceholderData: boolean;
}

/**
 * Manage the article starred state.
 * @param options - The options used to manage the article starred state.
 * @returns The article starred state and callbacks.
 */
export function useArticleStarredState(options: UseArticleStarredStateOptions) {
  const {
    articleFilter,
    createMutationSignalHandle,
    mutationTracker,
    setFeed,
    usePlaceholderData,
  } = options;
  const mutationVersions = useArticleStatusMutationVersions();
  /** Toggles the article's starred state with optimistic UI and rollback. */
  const handleToggleStarredState = useCallback(
    async (article: Article) => {
      const nextStarredState = !article.isStarred;
      await runStarredStateMutation({
        article,
        articleFilter,
        createMutationSignalHandle,
        mutationTracker,
        mutationVersions,
        nextStarredState,
        setFeed,
        usePlaceholderData,
      });
    },
    [
      articleFilter,
      createMutationSignalHandle,
      mutationVersions,
      mutationTracker,
      setFeed,
      usePlaceholderData,
    ],
  );

  return { handleToggleStarredState };
}

/**
 * Apply the optimistic starred-state change to the current feed window.
 * @param currentFeed - The feed currently visible in state.
 * @param article - The article being updated.
 * @param articleFilter - The active article filter.
 * @param nextStarredState - The optimistic starred value to apply.
 * @returns The optimistic feed snapshot.
 */
function applyStarredStateOptimisticUpdate(
  currentFeed: Article[],
  article: Article,
  articleFilter: UseArticleStarredStateOptions["articleFilter"],
  nextStarredState: boolean,
): Article[] {
  const articleKey = getArticleKey(article);
  const updated = currentFeed.map((candidate) =>
    getArticleKey(candidate) === articleKey
      ? { ...candidate, isStarred: nextStarredState }
      : candidate,
  );

  if (articleFilter === "starred" && !nextStarredState) {
    return updated.filter(
      (candidate) => getArticleKey(candidate) !== articleKey,
    );
  }

  return updated;
}

/**
 * Create the shared optimistic mutation options for one starred-state update.
 * @param mutationOptions - Starred-state mutation inputs and ownership helpers.
 * @param articleVersions - Local mutation versions captured for this update.
 * @returns Options consumed by the shared optimistic status mutation runner.
 */
function createStarredStateMutationOptions(
  mutationOptions: StarredStateMutationOptions,
  articleVersions: ReadonlyMap<string, number>,
) {
  return {
    /**
     * Apply the optimistic starred-state update to the current feed window.
     * @param currentFeed - The current feed snapshot.
     * @returns The optimistic feed snapshot with the new starred state applied.
     */
    applyOptimisticUpdate: (currentFeed: Article[]) =>
      applyStarredStateOptimisticUpdate(
        currentFeed,
        mutationOptions.article,
        mutationOptions.articleFilter,
        mutationOptions.nextStarredState,
      ),
    articles: [mutationOptions.article],
    createMutationSignalHandle: mutationOptions.createMutationSignalHandle,
    errorLogLabel: "Toggle starred state error",
    mutationTracker: mutationOptions.mutationTracker,
    /**
     * Show the fallback error toast when the mutation fails.
     */
    onError: () => {
      toast.error("Unable to update starred state right now.");
    },
    /**
     * Restore the starred-state change for any articles whose update failed.
     * @param currentFeed - The current feed snapshot.
     * @param articleMap - The original article map captured by the mutation helper.
     * @param failedArticleKeys - The article keys that failed to update.
     * @returns The restored feed snapshot.
     */
    restoreUpdate: (
      currentFeed: Article[],
      articleMap: Map<string, Article>,
      failedArticleKeys?: Set<string>,
    ) =>
      restoreStarredStateUpdate(
        currentFeed,
        mutationOptions.article,
        mutationOptions.articleFilter,
        articleMap,
        failedArticleKeys,
      ),
    setFeed: mutationOptions.setFeed,
    shouldApplySettledUpdate: createSettledArticleStatusMutationGuard(
      mutationOptions.mutationVersions,
      articleVersions,
    ),
    /**
     * Create the persisted starred-state patch for the article.
     * @returns Article status patch sent to the API.
     */
    statusPatchForArticle: () => ({
      isStarred: mutationOptions.nextStarredState,
    }),
    usePlaceholderData: mutationOptions.usePlaceholderData,
  };
}

/**
 * Restore the starred-state change when the mutation fails for the article.
 * @param currentFeed - The feed currently visible in state.
 * @param article - The article being restored.
 * @param articleFilter - The active article filter.
 * @param articleMap - The original article map captured by the mutation helper.
 * @param failedArticleKeys - The failed article keys reported by the mutation helper.
 * @returns The restored feed snapshot.
 */
function restoreStarredStateUpdate(
  currentFeed: Article[],
  article: Article,
  articleFilter: UseArticleStarredStateOptions["articleFilter"],
  articleMap: Map<string, Article>,
  failedArticleKeys?: Set<string>,
): Article[] {
  const articleKey = getArticleKey(article);
  const reverted = currentFeed.map((candidate) => {
    const candidateKey = getArticleKey(candidate);
    const shouldRestore =
      failedArticleKeys === undefined || failedArticleKeys.has(candidateKey);

    if (!shouldRestore || candidateKey !== articleKey) {
      return candidate;
    }

    return { ...candidate, isStarred: article.isStarred };
  });

  if (
    !shouldRestoreStarredArticle(
      articleKey,
      articleFilter,
      article.isStarred === true,
      failedArticleKeys,
    )
  ) {
    return reverted;
  }

  const alreadyPresent = reverted.some(
    (candidate) => getArticleKey(candidate) === articleKey,
  );

  if (alreadyPresent) {
    return reverted;
  }

  const originalArticle = articleMap.get(articleKey) ?? article;
  return [originalArticle, ...reverted];
}

/**
 * Run a starred-state mutation and release its local mutation versions when done.
 * @param mutationOptions - Starred-state mutation inputs and ownership helpers.
 */
async function runStarredStateMutation(
  mutationOptions: StarredStateMutationOptions,
) {
  const articleVersions =
    mutationOptions.mutationVersions.trackArticleMutationVersions([
      mutationOptions.article,
    ]);

  try {
    await runOptimisticArticleStatusMutation(
      createStarredStateMutationOptions(mutationOptions, articleVersions),
    );
  } finally {
    mutationOptions.mutationVersions.releaseArticleMutationVersions(
      articleVersions,
    );
  }
}

/**
 * Determine whether a failed starred-state mutation should restore the article to view.
 * @param articleKey - The key of the article that failed to update.
 * @param articleFilter - The active article filter.
 * @param wasStarred - Whether the article was starred before the failed mutation.
 * @param failedArticleKeys - The failed article keys reported by the mutation helper.
 * @returns Whether the article should be restored into the current feed snapshot.
 */
function shouldRestoreStarredArticle(
  articleKey: string,
  articleFilter: UseArticleStarredStateOptions["articleFilter"],
  wasStarred: boolean,
  failedArticleKeys?: Set<string>,
): boolean {
  const didFail =
    failedArticleKeys === undefined || failedArticleKeys.has(articleKey);

  return didFail && articleFilter === "starred" && wasStarred;
}
