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

/**
 * Describes the handle feed read deps.
 */
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

/**
 * Describes the handle feed source list read deps.
 */
interface HandleFeedSourceListReadDeps {
  getCachedFeedSources: typeof getCachedFeedSourceList;
  listSourcesForUser: typeof listFeedSourcesForUser;
  logInfo: typeof logger.info;
  setCachedFeedSources: typeof setCachedFeedSourceList;
  toFeedSource: typeof toFeedSourceResponse;
}

/**
 * Describes the handle single feed read deps.
 */
interface HandleSingleFeedReadDeps {
  fetchFeedArticles: typeof fetchAndCacheFeedArticles;
  getDbForRead: typeof getDb;
}

/**
 * Describes the resolved feed read context.
 */
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
 * Dispatch a GET /api/feeds request to either a single feed or the full source list.
 * @param userId - The user ID.
 * @param feedUrl - The feed url.
 * @param deps - The deps.
 * @returns The JSON response containing feed articles or the full feed source list.
 */
export async function handleFeedRead(
  userId: number,
  feedUrl: null | string,
  deps: HandleFeedReadDeps = {},
) {
  return handleResolvedFeedRead(userId, resolveFeedReadContext(feedUrl, deps));
}

/**
 * Format a source count for display in log messages.
 * @param sourceCount - The source count value.
 * @returns A human-readable string like "3 sources" or "1 source".
 */
function formatFeedSourceCount(sourceCount: number) {
  return `${sourceCount} source${sourceCount === 1 ? "" : "s"}`;
}

/**
 * Fetch and return the authenticated user's full feed source list, using the in-memory cache when available.
 * @param userId - The user ID.
 * @param deps - The deps.
 * @returns A JSON response containing the array of feed source records.
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
 * Return placeholder feed sources or articles for preview-mode requests.
 * @param normalizedFeedUrl - The normalized feed URL.
 * @param getPlaceholderArticles - Optional override to retrieve placeholder articles for the feed.
 * @returns A JSON response containing placeholder sources or articles for the given URL.
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
 * Dispatch the resolved feed-read request to the appropriate handler based on runtime mode.
 * @param userId - The user ID.
 * @param context - The context used to process the handle resolved feed read.
 * @returns The JSON response produced by the matching feed-read handler.
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
 * Fetch and return the articles for a specific feed from the database.
 * @param userId - The user ID.
 * @param normalizedFeedUrl - The normalized feed URL.
 * @param deps - The deps.
 * @returns A JSON response containing the article array for the requested feed URL.
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
 * Build a fully-resolved dependency context for a feed-read request.
 * @param feedUrl - The feed url.
 * @param deps - The deps.
 * @returns The resolved context object used to dispatch the feed-read operation.
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
 * @returns The resolved dependency function, falling back to the production default if not provided.
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
