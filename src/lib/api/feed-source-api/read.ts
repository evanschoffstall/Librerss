import { NextResponse } from "next/server";

import { logger } from "@/lib";
import { PLACEHOLDER_FEED_SOURCES, RUNTIME_FLAGS } from "@/lib/core";
import { getPlaceholderArticlesForSource } from "@/lib/core/placeholder";
import {
  fetchAndCacheFeedArticles,
  getCachedFeedSourceList,
  setCachedFeedSourceList,
} from "@/lib/core/server";
import { getDb } from "@/lib/db";
import { tryNormalizeFeedUrl } from "@/lib/utils";

import type { FeedSourceListRow } from "./types";

import { listFeedSourcesForUser, toFeedSourceResponse } from "./repository";

interface HandleFeedReadDeps {
  fetchAndCacheFeedArticlesFn?: typeof fetchAndCacheFeedArticles;
  getCachedFeedSourceListFn?: typeof getCachedFeedSourceList;
  getDbFn?: typeof getDb;
  getPlaceholderArticlesForSourceFn?: typeof getPlaceholderArticlesForSource;
  listFeedSourcesForUserFn?: typeof listFeedSourcesForUser;
  logInfo?: typeof logger.info;
  setCachedFeedSourceListFn?: typeof setCachedFeedSourceList;
  toFeedSourceResponseFn?: typeof toFeedSourceResponse;
  tryNormalizeFeedUrlFn?: typeof tryNormalizeFeedUrl;
}

interface ResolvedFeedReadContext {
  fetchFeedArticles: typeof fetchAndCacheFeedArticles;
  getCachedFeedSources: typeof getCachedFeedSourceList;
  getDbForRead: typeof getDb;
  getPlaceholderArticles: typeof getPlaceholderArticlesForSource;
  listSourcesForUser: typeof listFeedSourcesForUser;
  logInfo: typeof logger.info;
  normalizedFeedUrl: null | string;
  setCachedFeedSources: typeof setCachedFeedSourceList;
  toFeedSource: typeof toFeedSourceResponse;
}

/**
 * Resolves either the user's feed-source list or a single feed's article list.
 *
 * The feed-source list path uses a per-user in-memory cache so dashboard boot
 * does not re-run the same join-heavy `/api/feeds` query when the sidebar is
 * requested repeatedly during the cache TTL.
 * @param userId
 * @param feedUrl
 * @param deps
 */
export async function handleFeedRead(
  userId: number,
  feedUrl: null | string,
  deps: HandleFeedReadDeps = {},
) {
  return handleResolvedFeedRead(userId, resolveFeedReadContext(feedUrl, deps));
}

/**
 * @param sourceCount
 */
function formatFeedSourceCount(sourceCount: number) {
  return `${sourceCount} source${sourceCount === 1 ? "" : "s"}`;
}

/**
 * @param userId
 * @param deps
 * @param deps.getCachedFeedSources
 * @param deps.listSourcesForUser
 * @param deps.logInfo
 * @param deps.setCachedFeedSources
 * @param deps.toFeedSource
 */
async function handleFeedSourceListRead(
  userId: number,
  deps: {
    getCachedFeedSources: typeof getCachedFeedSourceList;
    listSourcesForUser: typeof listFeedSourcesForUser;
    logInfo: typeof logger.info;
    setCachedFeedSources: typeof setCachedFeedSourceList;
    toFeedSource: typeof toFeedSourceResponse;
  },
) {
  const cachedSources = deps.getCachedFeedSources(userId);
  if (cachedSources) {
    deps.logInfo(
      `Feed list [${formatFeedSourceCount(cachedSources.length)}]: resolved=memory`,
    );
    return NextResponse.json(cachedSources);
  }

  const sources = await deps.listSourcesForUser(userId);
  const sourcesResponse = sources.map(
    (source): FeedSourceListRow => deps.toFeedSource(source),
  );
  deps.setCachedFeedSources(userId, sourcesResponse);
  deps.logInfo(
    `Feed list [${formatFeedSourceCount(sourcesResponse.length)}]: resolved=database`,
  );
  return NextResponse.json(sourcesResponse);
}

/**
 * @param normalizedFeedUrl
 * @param getPlaceholderArticles
 */
function handlePlaceholderFeedRead(
  normalizedFeedUrl: null | string,
  getPlaceholderArticles: typeof getPlaceholderArticlesForSource,
) {
  if (!normalizedFeedUrl) {
    return NextResponse.json(PLACEHOLDER_FEED_SOURCES);
  }

  return NextResponse.json(getPlaceholderArticles(normalizedFeedUrl));
}

/**
 * Dispatches the read request to placeholder, list, or single-feed modes.
 * @param userId
 * @param context
 */
function handleResolvedFeedRead(
  userId: number,
  context: ResolvedFeedReadContext,
) {
  if (RUNTIME_FLAGS.usePlaceholderData) {
    return handlePlaceholderFeedRead(
      context.normalizedFeedUrl,
      context.getPlaceholderArticles,
    );
  }

  return context.normalizedFeedUrl
    ? handleSingleFeedRead(userId, context.normalizedFeedUrl, {
        fetchFeedArticles: context.fetchFeedArticles,
        getDbForRead: context.getDbForRead,
      })
    : handleFeedSourceListRead(userId, {
        getCachedFeedSources: context.getCachedFeedSources,
        listSourcesForUser: context.listSourcesForUser,
        logInfo: context.logInfo,
        setCachedFeedSources: context.setCachedFeedSources,
        toFeedSource: context.toFeedSource,
      });
}

/**
 * @param userId
 * @param normalizedFeedUrl
 * @param deps
 * @param deps.fetchFeedArticles
 * @param deps.getDbForRead
 */
async function handleSingleFeedRead(
  userId: number,
  normalizedFeedUrl: string,
  deps: {
    fetchFeedArticles: typeof fetchAndCacheFeedArticles;
    getDbForRead: typeof getDb;
  },
) {
  const db = deps.getDbForRead();
  const feedArticles = await deps.fetchFeedArticles(
    db,
    userId,
    normalizedFeedUrl,
  );
  return NextResponse.json(feedArticles);
}

/**
 * Normalizes optional dependencies once so the exported entrypoint stays a thin
 * dispatcher rather than carrying the complexity cost of dependency fallback
 * and mode branching.
 * @param feedUrl
 * @param deps
 */
function resolveFeedReadContext(
  feedUrl: null | string,
  deps: HandleFeedReadDeps,
): ResolvedFeedReadContext {
  const normalizeFeedUrlForRead = resolveFeedReadDependency(
    deps.tryNormalizeFeedUrlFn,
    tryNormalizeFeedUrl,
  );

  return {
    fetchFeedArticles: resolveFeedReadDependency(
      deps.fetchAndCacheFeedArticlesFn,
      fetchAndCacheFeedArticles,
    ),
    getCachedFeedSources: resolveFeedReadDependency(
      deps.getCachedFeedSourceListFn,
      getCachedFeedSourceList,
    ),
    getDbForRead: resolveFeedReadDependency(deps.getDbFn, getDb),
    getPlaceholderArticles: resolveFeedReadDependency(
      deps.getPlaceholderArticlesForSourceFn,
      getPlaceholderArticlesForSource,
    ),
    listSourcesForUser: resolveFeedReadDependency(
      deps.listFeedSourcesForUserFn,
      listFeedSourcesForUser,
    ),
    logInfo: resolveFeedReadDependency(deps.logInfo, logger.info.bind(logger)),
    normalizedFeedUrl: resolveRequestedFeedUrl(
      feedUrl,
      normalizeFeedUrlForRead,
    ),
    setCachedFeedSources: resolveFeedReadDependency(
      deps.setCachedFeedSourceListFn,
      setCachedFeedSourceList,
    ),
    toFeedSource: resolveFeedReadDependency(
      deps.toFeedSourceResponseFn,
      toFeedSourceResponse,
    ),
  };
}

/**
 * Returns the provided dependency override or the canonical implementation.
 * @param dependency
 * @param fallback
 */
function resolveFeedReadDependency<T>(
  dependency: T | undefined,
  fallback: T,
): T {
  return dependency ?? fallback;
}

/**
 * Normalizes the optional feed URL once before dispatching mode-specific work.
 * @param feedUrl
 * @param normalizeFeedUrlForRead
 */
function resolveRequestedFeedUrl(
  feedUrl: null | string,
  normalizeFeedUrlForRead: typeof tryNormalizeFeedUrl,
): null | string {
  return feedUrl ? normalizeFeedUrlForRead(feedUrl) : null;
}
