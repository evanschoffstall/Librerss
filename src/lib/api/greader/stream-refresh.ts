import { and, eq } from "drizzle-orm";

import { fetchAndCacheFeedArticlesBatch } from "@/lib/core/feed-fetcher";
import {
  FEED_STREAM_PREFIX,
  READING_LIST_STREAM,
  STARRED_STATE,
} from "@/lib/core/stream-ids";
import { getDb } from "@/lib/db/db";
import { feedSources } from "@/lib/db/schema";
import { logger } from "@/lib/logger";
import { toErrorMessage } from "@/lib/utils/errors";

export async function maybeRefreshGReaderStreamFeeds(
  userId: number,
  streamId: string,
  requestSource: string,
): Promise<void> {
  try {
    const targetUrls = await resolveStreamFeedUrls(userId, streamId);

    if (targetUrls.length === 0) {
      return;
    }

    const db = getDb();
    const { cachedCount, errors, refreshedCount } =
      await fetchAndCacheFeedArticlesBatch(db, userId, targetUrls, {
        requestSource,
      });

    logger.info("[greader] stream refresh", {
      cachedCount,
      refreshedCount,
      requestSource,
      streamId,
      targetFeedCount: targetUrls.length,
      upstreamErrorCount: errors.size,
      userId,
    });
  } catch (error) {
    logger.warn("[greader] stream refresh skipped", {
      error: toErrorMessage(error),
      requestSource,
      streamId,
      userId,
    });
  }
}

async function resolveStreamFeedUrls(
  userId: number,
  streamId: string,
): Promise<string[]> {
  if (streamId.startsWith(FEED_STREAM_PREFIX)) {
    const feedUrl = streamId.slice(FEED_STREAM_PREFIX.length);
    return feedUrl ? [feedUrl] : [];
  }

  if (streamId !== READING_LIST_STREAM && streamId !== STARRED_STATE) {
    return [];
  }

  const db = getDb();
  const rows = await db
    .select({ url: feedSources.url })
    .from(feedSources)
    .where(and(eq(feedSources.userId, userId), eq(feedSources.enabled, true)));

  return [...new Set(rows.map((row) => row.url).filter(Boolean))];
}
