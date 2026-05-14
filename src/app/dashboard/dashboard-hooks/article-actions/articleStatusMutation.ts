"use client";

import type React from "react";

import { useCallback, useMemo, useRef, useState } from "react";

import type { Article } from "@/lib/core";

import { getArticleKey } from "@/app/dashboard/dashboard-services/article-collection";
import { ArticleService } from "@/lib/api";

/**
 * Tracks overlapping article-status mutations with reference counts so one
 * mutation cannot clear another in-flight owner for the same article key.
 */
export interface ArticleMutationTracker {
  clearUpdatingArticleKeys: (articleKeys: Iterable<string>) => void;
  markUpdatingArticleKeys: (articleKeys: Iterable<string>) => void;
  updatingArticleState: Record<string, boolean>;
}

/**
 * Owns the abort controllers for overlapping article-status mutations so the
 * dashboard can cancel stale writes when a suspended tab resumes.
 */
export interface ArticleStatusMutationController {
  cancelPendingMutations: () => void;
  createMutationSignalHandle: () => ArticleStatusMutationSignalHandle;
}

/**
 * Holds the signal and cleanup callback for one in-flight article mutation.
 */
export interface ArticleStatusMutationSignalHandle {
  release: () => void;
  signal: AbortSignal;
}

/**
 * Result for a batch article-status mutation so callers can preserve their
 * existing success accounting without reimplementing the mutation loop.
 */
export interface OptimisticArticleStatusMutationResult {
  attemptedCount: number;
  failedArticleKeys: Set<string>;
}

/**
 * Defines the article status patch type.
 */
type ArticleStatusPatch = Parameters<
  typeof ArticleService.updateArticleStatus
>[1];

/**
 * Describes the options for optimistic article status mutation.
 */
interface OptimisticArticleStatusMutationOptions {
  applyOptimisticUpdate: (
    currentFeed: Article[],
    articlesByKey: Map<string, Article>,
  ) => Article[];
  articles: Article[];
  createMutationSignalHandle?: () => ArticleStatusMutationSignalHandle;
  errorLogLabel: string;
  mutationTracker: Pick<
    ArticleMutationTracker,
    "clearUpdatingArticleKeys" | "markUpdatingArticleKeys"
  >;
  onError?: () => void;
  restoreUpdate: (
    currentFeed: Article[],
    articlesByKey: Map<string, Article>,
    failedArticleKeys?: Set<string>,
  ) => Article[];
  setFeed: React.Dispatch<React.SetStateAction<Article[]>>;
  statusPatchForArticle: (article: Article) => ArticleStatusPatch;
  usePlaceholderData: boolean;
}

/**
 * Process the run optimistic article status mutation.
 * @param options - The options used to process the run optimistic article status mutation.
 * @returns The run optimistic article status mutation.
 */
export async function runOptimisticArticleStatusMutation(
  options: OptimisticArticleStatusMutationOptions,
): Promise<OptimisticArticleStatusMutationResult> {
  const {
    applyOptimisticUpdate,
    articles,
    createMutationSignalHandle,
    errorLogLabel,
    mutationTracker,
    onError,
    restoreUpdate,
    setFeed,
    statusPatchForArticle,
    usePlaceholderData,
  } = options;
  const articlesByKey = createArticleMap(articles);
  if (articlesByKey.size === 0) {
    return { attemptedCount: 0, failedArticleKeys: new Set<string>() };
  }

  const articleEntries = Array.from(articlesByKey.entries());
  const articleKeys = articleEntries.map(([articleKey]) => articleKey);
  const mutationSignalHandle = createMutationSignalHandle?.();
  mutationTracker.markUpdatingArticleKeys(articleKeys);
  setFeed((currentFeed) => applyOptimisticUpdate(currentFeed, articlesByKey));

  try {
    const failedArticleKeys = await persistArticleStatusMutations(
      articleEntries,
      statusPatchForArticle,
      mutationSignalHandle?.signal,
      usePlaceholderData,
    );

    if (failedArticleKeys.size > 0) {
      setFeed((currentFeed) =>
        restoreUpdate(currentFeed, articlesByKey, failedArticleKeys),
      );
      onError?.();
    }

    return {
      attemptedCount: articlesByKey.size,
      failedArticleKeys,
    };
  } catch (error) {
    console.error(errorLogLabel, error);
    setFeed((currentFeed) => restoreUpdate(currentFeed, articlesByKey));
    onError?.();
    return {
      attemptedCount: articlesByKey.size,
      failedArticleKeys: new Set(articleKeys),
    };
  } finally {
    mutationSignalHandle?.release();
    mutationTracker.clearUpdatingArticleKeys(articleKeys);
  }
}

/**
 * Manage the article mutation tracker.
 * @returns The article mutation tracker state and callbacks.
 */
export function useArticleMutationTracker(): ArticleMutationTracker {
  const [updatingArticleCounts, setUpdatingArticleCounts] = useState<
    Record<string, number>
  >({});

  const markUpdatingArticleKeys = useCallback(
    (articleKeys: Iterable<string>) => {
      setUpdatingArticleCounts((current) =>
        applyUpdatingArticleDelta(current, articleKeys, 1),
      );
    },
    [],
  );

  const clearUpdatingArticleKeys = useCallback(
    (articleKeys: Iterable<string>) => {
      setUpdatingArticleCounts((current) =>
        applyUpdatingArticleDelta(current, articleKeys, -1),
      );
    },
    [],
  );

  const updatingArticleState = useMemo(
    () =>
      Object.fromEntries(
        Object.keys(updatingArticleCounts).map((articleKey) => [
          articleKey,
          true,
        ]),
      ),
    [updatingArticleCounts],
  );

  return {
    clearUpdatingArticleKeys,
    markUpdatingArticleKeys,
    updatingArticleState,
  };
}

/**
 * Manage the shared abort ownership for all in-flight article-status writes.
 * @returns The controller used to allocate and cancel mutation signals.
 */
export function useArticleStatusMutationController(): ArticleStatusMutationController {
  const pendingControllersRef = useRef(new Set<AbortController>());

  const createMutationSignalHandle = useCallback(() => {
    const controller = new AbortController();
    pendingControllersRef.current.add(controller);

    return {
      /**
       * Remove this mutation controller from the active cancellation set once the write settles.
       */
      release: () => {
        pendingControllersRef.current.delete(controller);
      },
      signal: controller.signal,
    } satisfies ArticleStatusMutationSignalHandle;
  }, []);

  const cancelPendingMutations = useCallback(() => {
    for (const controller of pendingControllersRef.current) {
      controller.abort("dashboard-stale-tab-resume");
    }

    pendingControllersRef.current.clear();
  }, []);

  return {
    cancelPendingMutations,
    createMutationSignalHandle,
  };
}

/**
 * Process the apply updating article delta.
 * @param current - The current.
 * @param articleKeys - The article keys.
 * @param delta - The delta.
 * @returns The apply updating article delta.
 */
function applyUpdatingArticleDelta(
  current: Record<string, number>,
  articleKeys: Iterable<string>,
  delta: -1 | 1,
): Record<string, number> {
  const nextEntries = new Map(Object.entries(current));

  for (const articleKey of articleKeys) {
    if (!articleKey) {
      continue;
    }

    const nextCount = (nextEntries.get(articleKey) ?? 0) + delta;
    if (nextCount <= 0) {
      nextEntries.delete(articleKey);
      continue;
    }

    nextEntries.set(articleKey, nextCount);
  }

  return Object.fromEntries(nextEntries);
}

/**
 * Create the article map.
 * @param articles - The articles.
 * @returns The article map.
 */
function createArticleMap(articles: Article[]): Map<string, Article> {
  const articleMap = new Map<string, Article>();

  for (const article of articles) {
    articleMap.set(getArticleKey(article), article);
  }

  return articleMap;
}

/**
 * Process the persist article status mutations.
 * @param articleEntries - The article entries.
 * @param statusPatchForArticle - The callback that status patch for article.
 * @param signal - The abort signal tied to the owning dashboard lifecycle.
 * @param usePlaceholderData - The placeholder data.
 * @returns The persist article status mutations.
 */
async function persistArticleStatusMutations(
  articleEntries: [string, Article][],
  statusPatchForArticle: (article: Article) => ArticleStatusPatch,
  signal: AbortSignal | undefined,
  usePlaceholderData: boolean,
): Promise<Set<string>> {
  if (usePlaceholderData) {
    return new Set<string>();
  }

  const results = await Promise.allSettled(
    articleEntries.map(([, article]) => {
      const statusPatch = statusPatchForArticle(article);

      if (signal === undefined) {
        return ArticleService.updateArticleStatus(article.id, statusPatch);
      }

      return ArticleService.updateArticleStatus(article.id, statusPatch, {
        signal,
      });
    }),
  );

  return new Set(
    articleEntries
      .filter((_entry, index) => results[index]?.status === "rejected")
      .map(([articleKey]) => articleKey),
  );
}
