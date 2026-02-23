import { fetchAndCacheFeedArticles } from "@/lib/core/feed-fetcher";
import {
  getPlaceholderArticlesForSource,
  PLACEHOLDER_FEED_SOURCES,
} from "@/lib/core/placeholder";
import { RUNTIME_FLAGS } from "@/lib/core/runtime";
import { getDb } from "@/lib/db/db";
import { tryNormalizeFeedUrl } from "@/lib/utils/url";
import { NextResponse } from "next/server";
import {
  listFeedSourcesForUser,
  toFeedSourceResponse,
} from "./feed-repository";

export async function handleFeedRead(userId: number, feedUrl: string | null) {
  const normalizedFeedUrl = feedUrl ? tryNormalizeFeedUrl(feedUrl) : null;

  if (RUNTIME_FLAGS.usePlaceholderData) {
    if (!normalizedFeedUrl) {
      return NextResponse.json(PLACEHOLDER_FEED_SOURCES);
    }

    return NextResponse.json(
      getPlaceholderArticlesForSource(normalizedFeedUrl),
    );
  }

  if (!normalizedFeedUrl) {
    const sources = await listFeedSourcesForUser(userId);
    return NextResponse.json(sources.map(toFeedSourceResponse));
  }

  const db = getDb();
  const feedArticles = await fetchAndCacheFeedArticles(
    db,
    userId,
    normalizedFeedUrl,
  );
  return NextResponse.json(feedArticles);
}
