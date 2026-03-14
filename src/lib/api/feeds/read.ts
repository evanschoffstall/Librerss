import { NextResponse } from "next/server";

import { listFeedSourcesForUser, toFeedSourceResponse } from "./repository";
import type { FeedSourceListRow } from "./types";

import {
  getCachedFeedSourceList,
  setCachedFeedSourceList,
} from "@/lib/core/feed-cache";
import { fetchAndCacheFeedArticles } from "@/lib/core/feed-fetcher";
import {
  getPlaceholderArticlesForSource,
  PLACEHOLDER_FEED_SOURCES,
} from "@/lib/core/placeholder";
import { RUNTIME_FLAGS } from "@/lib/core/runtime";
import { getDb } from "@/lib/db/db";
import { logger } from "@/lib/logger";
import { tryNormalizeFeedUrl } from "@/lib/utils/url";

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
 * Resolves either the user's feed-source list or a single feed's article list.
 *
 * The feed-source list path uses a per-user in-memory cache so dashboard boot
 * does not re-run the same join-heavy `/api/feeds` query when the sidebar is
 * requested repeatedly during the cache TTL.
 */
export async function handleFeedRead(
  userId: number,
  feedUrl: null | string,
  deps: HandleFeedReadDeps = {},
) {
  const normalizeFeedUrlForRead =
    deps.tryNormalizeFeedUrlFn ?? tryNormalizeFeedUrl;
  const normalizedFeedUrl = feedUrl ? normalizeFeedUrlForRead(feedUrl) : null;
  const getCachedFeedSources =
    deps.getCachedFeedSourceListFn ?? getCachedFeedSourceList;
  const setCachedFeedSources =
    deps.setCachedFeedSourceListFn ?? setCachedFeedSourceList;
  const listSourcesForUser =
    deps.listFeedSourcesForUserFn ?? listFeedSourcesForUser;
  const toFeedSource = deps.toFeedSourceResponseFn ?? toFeedSourceResponse;
  const logInfo = deps.logInfo ?? logger.info.bind(logger);
  const fetchFeedArticles =
    deps.fetchAndCacheFeedArticlesFn ?? fetchAndCacheFeedArticles;
  const getDbForRead = deps.getDbFn ?? getDb;
  const getPlaceholderArticles =
    deps.getPlaceholderArticlesForSourceFn ?? getPlaceholderArticlesForSource;

  if (RUNTIME_FLAGS.usePlaceholderData) {
    if (!normalizedFeedUrl) {
      return NextResponse.json(PLACEHOLDER_FEED_SOURCES);
    }

    return NextResponse.json(getPlaceholderArticles(normalizedFeedUrl));
  }

  if (!normalizedFeedUrl) {
    const cachedSources = getCachedFeedSources(userId);
    if (cachedSources) {
      logInfo(
        `Feed list [${cachedSources.length} source${cachedSources.length !== 1 ? "s" : ""}]: resolved=memory`,
      );
      return NextResponse.json(cachedSources);
    }

    const sources = await listSourcesForUser(userId);
    const sourcesResponse = sources.map(
      (source): FeedSourceListRow => toFeedSource(source),
    );
    setCachedFeedSources(userId, sourcesResponse);
    logInfo(
      `Feed list [${sourcesResponse.length} source${sourcesResponse.length !== 1 ? "s" : ""}]: resolved=database`,
    );
    return NextResponse.json(sourcesResponse);
  }

  const db = getDbForRead();
  const feedArticles = await fetchFeedArticles(db, userId, normalizedFeedUrl);
  return NextResponse.json(feedArticles);
}
