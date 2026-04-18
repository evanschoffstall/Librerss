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
 * Shared optimistic mutation pipeline for dashboard article read/star state.
 * @param root0
 * @param root0.applyOptimisticUpdate
 * @param root0.articles
 * @param root0.errorLogLabel
 * @param root0.mutationTracker
 * @param root0.onError
 * @param root0.restoreUpdate
 * @param root0.setFeed
 * @param root0.statusPatchForArticle
 * @param root0.usePlaceholderData
 */
export async function runOptimisticArticleStatusMutation({
  applyOptimisticUpdate,
  articles,
  errorLogLabel,
  mutationTracker,
  onError,
  restoreUpdate,
  setFeed,
  statusPatchForArticle,
  usePlaceholderData,
}: OptimisticArticleStatusMutationOptions): Promise<OptimisticArticleStatusMutationResult> {
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
 * Build the shared updating-state controller used by dashboard article
 * mutations so overlapping operations keep one authoritative in-flight map.
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
 * @param current
 * @param articleKeys
 * @param delta
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
 * @param articles
 */
function createArticleMap(articles: Article[]): Map<string, Article> {
  const articleMap = new Map<string, Article>();

  for (const article of articles) {
    articleMap.set(getArticleKey(article), article);
  }

  return articleMap;
}

/**
 * @param articleEntries
 * @param statusPatchForArticle
 * @param usePlaceholderData
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
