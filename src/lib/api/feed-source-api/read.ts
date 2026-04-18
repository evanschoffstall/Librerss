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

interface HandleFeedSourceListReadDeps {
  getCachedFeedSources: typeof getCachedFeedSourceList;
  listSourcesForUser: typeof listFeedSourcesForUser;
  logInfo: typeof logger.info;
  setCachedFeedSources: typeof setCachedFeedSourceList;
  toFeedSource: typeof toFeedSourceResponse;
}

interface HandleSingleFeedReadDeps {
  fetchFeedArticles: typeof fetchAndCacheFeedArticles;
  getDbForRead: typeof getDb;
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
 * Process the handle feed read.
 * @param userId - The r id.
 * @param feedUrl - The feed url.
 * @param deps - The deps.
 * @returns The handle feed read.
 */
export async function handleFeedRead(
  userId: number,
  feedUrl: null | string,
  deps: HandleFeedReadDeps = {},
) {
  return handleResolvedFeedRead(userId, resolveFeedReadContext(feedUrl, deps));
}

/**
 * Process the format feed source count.
 * @param sourceCount - The source count value.
 * @returns The format feed source count.
 */
function formatFeedSourceCount(sourceCount: number) {
  return `${sourceCount} source${sourceCount === 1 ? "" : "s"}`;
}

/**
 * Process the handle feed source list read.
 * @param userId - The r id.
 * @param deps - The deps.
 * @returns The handle feed source list read.
 */
async function handleFeedSourceListRead(
  userId: number,
  deps: HandleFeedSourceListReadDeps,
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
 * Process the handle placeholder feed read.
 * @param normalizedFeedUrl - The d feed url.
 * @param getPlaceholderArticles - The callback that placeholder articles.
 * @returns The handle placeholder feed read.
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
 * Process the handle resolved feed read.
 * @param userId - The r id.
 * @param context - The context used to process the handle resolved feed read.
 * @returns The handle resolved feed read.
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
 * Process the handle single feed read.
 * @param userId - The r id.
 * @param normalizedFeedUrl - The d feed url.
 * @param deps - The deps.
 * @returns The handle single feed read.
 */
async function handleSingleFeedRead(
  userId: number,
  normalizedFeedUrl: string,
  deps: HandleSingleFeedReadDeps,
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
 * Resolve the feed read context.
 * @param feedUrl - The feed url.
 * @param deps - The deps.
 * @returns The feed read context.
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
 * Resolve the feed read dependency.
 * @param dependency - The dependency.
 * @param fallback - The fallback.
 * @returns The feed read dependency.
 */
function resolveFeedReadDependency<T>(
  dependency: T | undefined,
  fallback: T,
): T {
  return dependency ?? fallback;
}

/**
 * Resolve the requested feed url.
 * @param feedUrl - The feed url.
 * @param normalizeFeedUrlForRead - The feed url for read.
 * @returns The requested feed url.
 */
function resolveRequestedFeedUrl(
  feedUrl: null | string,
  normalizeFeedUrlForRead: typeof tryNormalizeFeedUrl,
): null | string {
  return feedUrl ? normalizeFeedUrlForRead(feedUrl) : null;
}
