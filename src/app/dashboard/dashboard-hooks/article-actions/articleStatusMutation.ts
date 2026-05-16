"use client";

import type React from "react";

import { useCallback, useMemo, useRef, useState } from "react";

import type { Article } from "@/lib/core";

import {
  filterArticleKeysBySettledState,
  filterArticleMapBySettledState,
  shouldApplySettledArticleUpdate,
} from "@/app/dashboard/dashboard-hooks/article-actions/articleStatusMutationSettledState";
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
 * Records the newest local status mutation version for each article key.
 */
export interface ArticleStatusMutationVersionTracker {
  isLatestArticleMutationVersion: (
    articleKey: string,
    version: number,
  ) => boolean;
  releaseArticleMutationVersions: (
    articleVersions: ReadonlyMap<string, number>,
  ) => void;
  trackArticleMutationVersions: (articles: Article[]) => Map<string, number>;
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
  shouldApplySettledUpdate?: (articleKey: string) => boolean;
  statusPatchForArticle: (article: Article) => ArticleStatusPatch;
  usePlaceholderData: boolean;
}

/**
 * Inputs needed to persist and settle one optimistic status mutation.
 */
interface PersistAndSettleArticleStatusMutationOptions {
  articleEntries: [string, Article][];
  articlesByKey: Map<string, Article>;
  mutationSignalHandle?: ArticleStatusMutationSignalHandle;
  options: OptimisticArticleStatusMutationOptions;
}

/**
 * Context required to restore state after a thrown persistence error.
 */
interface RejectedArticleStatusMutationOptions {
  articleKeys: string[];
  articlesByKey: Map<string, Article>;
  onError: OptimisticArticleStatusMutationOptions["onError"];
  restoreUpdate: OptimisticArticleStatusMutationOptions["restoreUpdate"];
  setFeed: OptimisticArticleStatusMutationOptions["setFeed"];
  shouldApplySettledUpdate: OptimisticArticleStatusMutationOptions["shouldApplySettledUpdate"];
}

/**
 * Context required to settle a successful persistence round.
 */
interface SettledArticleStatusMutationOptions {
  applyOptimisticUpdate: OptimisticArticleStatusMutationOptions["applyOptimisticUpdate"];
  articlesByKey: Map<string, Article>;
  failedArticleKeys: Set<string>;
  onError: OptimisticArticleStatusMutationOptions["onError"];
  restoreUpdate: OptimisticArticleStatusMutationOptions["restoreUpdate"];
  setFeed: OptimisticArticleStatusMutationOptions["setFeed"];
  shouldApplySettledUpdate: OptimisticArticleStatusMutationOptions["shouldApplySettledUpdate"];
}

/**
 * Create a guard that accepts only settled mutations still owning their article key.
 * @param mutationVersions - Shared mutation version tracker.
 * @param articleVersions - Versions captured when this mutation started.
 * @returns Guard used by the shared optimistic mutation runner.
 */
export function createSettledArticleStatusMutationGuard(
  mutationVersions: ArticleStatusMutationVersionTracker,
  articleVersions: ReadonlyMap<string, number>,
) {
  return (articleKey: string) => {
    const version = articleVersions.get(articleKey);

    return (
      version !== undefined &&
      mutationVersions.isLatestArticleMutationVersion(articleKey, version)
    );
  };
}

/**
 * Process the run optimistic article status mutation.
 * @param options - The options used to process the run optimistic article status mutation.
 * @returns The run optimistic article status mutation.
 */
export async function runOptimisticArticleStatusMutation(
  options: OptimisticArticleStatusMutationOptions,
): Promise<OptimisticArticleStatusMutationResult> {
  const articlesByKey = createArticleMap(options.articles);
  if (articlesByKey.size === 0) {
    return { attemptedCount: 0, failedArticleKeys: new Set<string>() };
  }

  const articleEntries = Array.from(articlesByKey.entries());
  const articleKeys = articleEntries.map(([articleKey]) => articleKey);
  const mutationSignalHandle = options.createMutationSignalHandle?.();
  options.mutationTracker.markUpdatingArticleKeys(articleKeys);
  options.setFeed((currentFeed) =>
    options.applyOptimisticUpdate(currentFeed, articlesByKey),
  );

  try {
    return await persistAndSettleArticleStatusMutation({
      articleEntries,
      articlesByKey,
      mutationSignalHandle,
      options,
    });
  } catch (error) {
    console.error(options.errorLogLabel, error);
    restoreRejectedArticleStatusMutation({
      articleKeys,
      articlesByKey,
      onError: options.onError,
      restoreUpdate: options.restoreUpdate,
      setFeed: options.setFeed,
      shouldApplySettledUpdate: options.shouldApplySettledUpdate,
    });
    return {
      attemptedCount: articlesByKey.size,
      failedArticleKeys: new Set(articleKeys),
    };
  } finally {
    mutationSignalHandle?.release();
    options.mutationTracker.clearUpdatingArticleKeys(articleKeys);
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
 * Track the most recent local status mutation for each article key so stale
 * mutation settlements cannot overwrite a newer user action.
 * @returns Version ownership helpers for optimistic article-status mutations.
 */
export function useArticleStatusMutationVersions(): ArticleStatusMutationVersionTracker {
  const latestMutationVersionByArticleKeyRef = useRef(
    new Map<string, number>(),
  );
  const nextMutationVersionRef = useRef(0);

  const trackArticleMutationVersions = useCallback((articles: Article[]) => {
    const articleVersions = new Map<string, number>();

    for (const article of articles) {
      const articleKey = getArticleKey(article);
      if (!articleKey) {
        continue;
      }

      const nextVersion = nextMutationVersionRef.current + 1;
      nextMutationVersionRef.current = nextVersion;
      latestMutationVersionByArticleKeyRef.current.set(articleKey, nextVersion);
      articleVersions.set(articleKey, nextVersion);
    }

    return articleVersions;
  }, []);

  const isLatestArticleMutationVersion = useCallback(
    (articleKey: string, version: number) =>
      latestMutationVersionByArticleKeyRef.current.get(articleKey) === version,
    [],
  );

  const releaseArticleMutationVersions = useCallback(
    (articleVersions: ReadonlyMap<string, number>) => {
      for (const [articleKey, version] of articleVersions) {
        if (
          latestMutationVersionByArticleKeyRef.current.get(articleKey) ===
          version
        ) {
          latestMutationVersionByArticleKeyRef.current.delete(articleKey);
        }
      }
    },
    [],
  );

  return useMemo(
    () => ({
      isLatestArticleMutationVersion,
      releaseArticleMutationVersions,
      trackArticleMutationVersions,
    }),
    [
      isLatestArticleMutationVersion,
      releaseArticleMutationVersions,
      trackArticleMutationVersions,
    ],
  );
}

/**
 * Reapply successful article status after any stale refresh has overwritten local state.
 * @param options - Settled mutation inputs and callbacks.
 */
function applySucceededArticleStatusUpdates(
  options: SettledArticleStatusMutationOptions,
) {
  const succeededArticlesByKey = filterArticleMapBySettledState(
    options.articlesByKey,
    (articleKey) =>
      !options.failedArticleKeys.has(articleKey) &&
      shouldApplySettledArticleUpdate(
        articleKey,
        options.shouldApplySettledUpdate,
      ),
  );

  if (succeededArticlesByKey.size === 0) {
    return;
  }

  options.setFeed((currentFeed) =>
    options.applyOptimisticUpdate(currentFeed, succeededArticlesByKey),
  );
}

/**
 * Apply a reference-count delta to every article key currently owned by an
 * optimistic mutation. Keys are removed once their count reaches zero so the
 * exposed updating state stays compact and truthy-only.
 * @param current - Existing per-article mutation counts.
 * @param articleKeys - Article keys whose in-flight count should change.
 * @param delta - Increment for mutation start or decrement for mutation settle.
 * @returns Updated per-article mutation counts.
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
 * Build the mutation snapshot keyed by the same stable article key used by the
 * rendered feed. Later optimistic and restore passes use this map to preserve
 * each article's original status values across async API settlement.
 * @param articles - Articles included in the current status mutation.
 * @returns Stable article-key to article snapshot map.
 */
function createArticleMap(articles: Article[]): Map<string, Article> {
  const articleMap = new Map<string, Article>();

  for (const article of articles) {
    articleMap.set(getArticleKey(article), article);
  }

  return articleMap;
}

/**
 * Persist article status changes and apply success or failure state to the feed.
 * @param mutationOptions - Runtime mutation inputs and settled-state callbacks.
 * @returns Attempt and failure counts for the completed mutation.
 */
async function persistAndSettleArticleStatusMutation(
  mutationOptions: PersistAndSettleArticleStatusMutationOptions,
): Promise<OptimisticArticleStatusMutationResult> {
  const { articleEntries, articlesByKey, mutationSignalHandle, options } =
    mutationOptions;
  const failedArticleKeys = await persistArticleStatusMutations(
    articleEntries,
    options.statusPatchForArticle,
    mutationSignalHandle?.signal,
    options.usePlaceholderData,
  );

  settlePersistedArticleStatusMutation({
    applyOptimisticUpdate: options.applyOptimisticUpdate,
    articlesByKey,
    failedArticleKeys,
    onError: options.onError,
    restoreUpdate: options.restoreUpdate,
    setFeed: options.setFeed,
    shouldApplySettledUpdate: options.shouldApplySettledUpdate,
  });

  return {
    attemptedCount: articlesByKey.size,
    failedArticleKeys,
  };
}

/**
 * Persist each article-status patch and report the article keys that failed.
 * @param articleEntries - Article-key and article pairs to persist.
 * @param statusPatchForArticle - Creates the API status patch for an article.
 * @param signal - The abort signal tied to the owning dashboard lifecycle.
 * @param usePlaceholderData - Whether placeholder mode should skip real API writes.
 * @returns Article keys whose persistence requests were rejected.
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

/**
 * Restore failed article status updates that were not superseded by newer local actions.
 * @param options - Settled mutation inputs and callbacks.
 */
function restoreFailedArticleStatusUpdates(
  options: SettledArticleStatusMutationOptions,
) {
  const restorableFailedArticleKeys = filterArticleKeysBySettledState(
    options.failedArticleKeys,
    options.shouldApplySettledUpdate,
  );

  if (restorableFailedArticleKeys.size === 0) {
    return;
  }

  options.setFeed((currentFeed) =>
    options.restoreUpdate(
      currentFeed,
      options.articlesByKey,
      restorableFailedArticleKeys,
    ),
  );
  options.onError?.();
}

/**
 * Restore all still-current article status updates after the persistence batch rejects.
 * @param options - Rejected mutation inputs and callbacks.
 */
function restoreRejectedArticleStatusMutation(
  options: RejectedArticleStatusMutationOptions,
) {
  const restorableArticleKeys = filterArticleKeysBySettledState(
    new Set(options.articleKeys),
    options.shouldApplySettledUpdate,
  );

  if (restorableArticleKeys.size === 0) {
    return;
  }

  options.setFeed((currentFeed) =>
    options.restoreUpdate(
      currentFeed,
      options.articlesByKey,
      restorableArticleKeys,
    ),
  );
  options.onError?.();
}

/**
 * Apply successful status results and restore failed rows that this mutation still owns.
 * @param options - Settled mutation inputs and callbacks.
 */
function settlePersistedArticleStatusMutation(
  options: SettledArticleStatusMutationOptions,
) {
  applySucceededArticleStatusUpdates(options);
  restoreFailedArticleStatusUpdates(options);
}
