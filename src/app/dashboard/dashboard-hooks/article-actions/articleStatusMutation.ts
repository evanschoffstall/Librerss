"use client";

import type React from "react";

import { useCallback, useMemo, useState } from "react";

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
 * Result for a batch article-status mutation so callers can preserve their
 * existing success accounting without reimplementing the mutation loop.
 */
export interface OptimisticArticleStatusMutationResult {
  attemptedCount: number;
  failedArticleKeys: Set<string>;
}

type ArticleStatusPatch = Parameters<
  typeof ArticleService.updateArticleStatus
>[1];

interface OptimisticArticleStatusMutationOptions {
  applyOptimisticUpdate: (
    currentFeed: Article[],
    articlesByKey: Map<string, Article>,
  ) => Article[];
  articles: Article[];
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
  mutationTracker.markUpdatingArticleKeys(articleKeys);
  setFeed((currentFeed) => applyOptimisticUpdate(currentFeed, articlesByKey));

  try {
    const failedArticleKeys = await persistArticleStatusMutations(
      articleEntries,
      statusPatchForArticle,
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
 * @param usePlaceholderData - The placeholder data.
 * @returns The persist article status mutations.
 */
async function persistArticleStatusMutations(
  articleEntries: [string, Article][],
  statusPatchForArticle: (article: Article) => ArticleStatusPatch,
  usePlaceholderData: boolean,
): Promise<Set<string>> {
  if (usePlaceholderData) {
    return new Set<string>();
  }

  const results = await Promise.allSettled(
    articleEntries.map(([, article]) =>
      ArticleService.updateArticleStatus(
        article.id,
        statusPatchForArticle(article),
      ),
    ),
  );

  return new Set(
    articleEntries
      .filter((_entry, index) => results[index]?.status === "rejected")
      .map(([articleKey]) => articleKey),
  );
}
