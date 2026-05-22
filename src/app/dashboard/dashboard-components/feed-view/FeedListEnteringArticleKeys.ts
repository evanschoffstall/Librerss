import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { type FeedListProps } from "@/app/dashboard/dashboard-components/feed-view/FeedList.types";
import { getArticleKey } from "@/app/dashboard/dashboard-services/article-collection";

const EMPTY_ENTERING_ARTICLE_KEYS: ReadonlySet<string> = new Set<string>();

/** Combined controller- and pagination-owned article entry state. */
interface FeedListEnteringArticleKeysState {
  combinedEnteringArticleKeys: ReadonlySet<string>;
  handleArticleEnteringDone: (articleKey: string) => void;
}

/** Inputs used to track article entry animations across pagination. */
interface UseFeedListEnteringArticleKeysOptions {
  animatingInArticleKeys?: ReadonlySet<string>;
  articleFilter: FeedListProps["articleFilter"];
  feedViewKey: FeedListProps["feedViewKey"];
  onEnteringDone?: FeedListProps["onEnteringDone"];
  searchTerm: FeedListProps["searchTerm"];
  visibleFeed: FeedListProps["filteredFeed"];
}

/**
 * Track controller- and pagination-owned article entry animations.
 * @param options - Visible-feed state and row entry callbacks.
 * @returns The combined entering keys and the row-settled callback.
 */
export function useFeedListEnteringArticleKeys(
  options: UseFeedListEnteringArticleKeysOptions,
): FeedListEnteringArticleKeysState {
  const {
    animatingInArticleKeys,
    articleFilter,
    feedViewKey,
    onEnteringDone,
    searchTerm,
    visibleFeed,
  } = options;
  const previousVisibleArticleKeysRef = useRef<string[]>([]);
  const [paginationEnteringArticleKeys, setPaginationEnteringArticleKeys] =
    useState(() => new Set<string>());

  useEffect(() => {
    previousVisibleArticleKeysRef.current = [];
    setPaginationEnteringArticleKeys(new Set());
  }, [articleFilter, feedViewKey, searchTerm]);

  useLayoutEffect(() => {
    const nextVisibleArticleKeys = getVisibleArticleKeys(visibleFeed);
    const previousVisibleArticleKeys = previousVisibleArticleKeysRef.current;
    previousVisibleArticleKeysRef.current = nextVisibleArticleKeys;

    const newlyVisibleArticleKeys = getNewlyVisibleArticleKeys(
      nextVisibleArticleKeys,
      previousVisibleArticleKeys,
    );

    if (newlyVisibleArticleKeys.length === 0) {
      return;
    }

    setPaginationEnteringArticleKeys(
      (currentPaginationEnteringArticleKeys) =>
        new Set([
          ...currentPaginationEnteringArticleKeys,
          ...newlyVisibleArticleKeys,
        ]),
    );
  }, [visibleFeed]);

  const combinedEnteringArticleKeys = useMemo(
    () =>
      mergeEnteringArticleKeys(
        animatingInArticleKeys,
        paginationEnteringArticleKeys,
      ),
    [animatingInArticleKeys, paginationEnteringArticleKeys],
  );

  const handleArticleEnteringDone = useCallback(
    (articleKey: string) => {
      setPaginationEnteringArticleKeys(
        (currentPaginationEnteringArticleKeys) => {
          if (!currentPaginationEnteringArticleKeys.has(articleKey)) {
            return currentPaginationEnteringArticleKeys;
          }

          const nextPaginationEnteringArticleKeys = new Set(
            currentPaginationEnteringArticleKeys,
          );
          nextPaginationEnteringArticleKeys.delete(articleKey);
          return nextPaginationEnteringArticleKeys;
        },
      );
      onEnteringDone?.(articleKey);
    },
    [onEnteringDone],
  );

  return {
    combinedEnteringArticleKeys,
    handleArticleEnteringDone,
  };
}

/**
 * Return the newly visible article keys.
 * @param nextVisibleArticleKeys - The current visible article keys.
 * @param previousVisibleArticleKeys - The previous visible article keys.
 * @returns The keys that were newly added to the visible window.
 */
function getNewlyVisibleArticleKeys(
  nextVisibleArticleKeys: string[],
  previousVisibleArticleKeys: string[],
): string[] {
  if (nextVisibleArticleKeys.length <= previousVisibleArticleKeys.length) {
    return [];
  }

  const previousVisibleArticleKeySet = new Set(previousVisibleArticleKeys);
  return nextVisibleArticleKeys.filter(
    (articleKey) => !previousVisibleArticleKeySet.has(articleKey),
  );
}

/**
 * Return the current visible article keys.
 * @param visibleFeed - The currently rendered feed rows.
 * @returns The rendered article keys.
 */
function getVisibleArticleKeys(
  visibleFeed: FeedListProps["filteredFeed"],
): string[] {
  return visibleFeed.map((article) => getArticleKey(article));
}

/**
 * Merge controller- and pagination-owned entering keys.
 * @param animatingInArticleKeys - Externally controlled entering keys.
 * @param paginationEnteringArticleKeys - Pagination-owned entering keys.
 * @returns The merged entering key set.
 */
function mergeEnteringArticleKeys(
  animatingInArticleKeys: ReadonlySet<string> | undefined,
  paginationEnteringArticleKeys: ReadonlySet<string>,
): ReadonlySet<string> {
  const controllerEnteringArticleKeys =
    animatingInArticleKeys ?? EMPTY_ENTERING_ARTICLE_KEYS;

  if (paginationEnteringArticleKeys.size === 0) {
    return controllerEnteringArticleKeys;
  }

  return new Set([
    ...controllerEnteringArticleKeys,
    ...paginationEnteringArticleKeys,
  ]);
}
