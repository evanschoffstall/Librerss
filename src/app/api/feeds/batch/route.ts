import { parseJsonBodyOrResponse } from "@/lib/api/request";
import {
  logAndRespondError,
  requireMutableAuthenticatedUser,
} from "@/lib/api/route-helpers";
import { CONFIG } from "@/lib/config";
import { fetchAndCacheFeedArticlesBatch } from "@/lib/core/feedFetcher";
import { getDb } from "@/lib/db/db";
import { normalizeDistinctUrlList, normalizeFeedUrl } from "@/lib/utils/url";
import { NextRequest, NextResponse } from "next/server";

type BatchRequestBody = {
  urls?: unknown;
  skipRefresh?: unknown;
};

export async function POST(request: NextRequest) {
  try {
    const user = await requireMutableAuthenticatedUser(request, {
      rateLimit: {
        key: "feed-batch",
        windowMs: CONFIG.RATE_LIMIT_FEED_BATCH_WINDOW_MS,
        maxAttempts: CONFIG.RATE_LIMIT_FEED_BATCH_MAX_REQUESTS,
      },
    });
    if (user instanceof Response) {
      return user;
    }

    const bodyOrResponse =
      await parseJsonBodyOrResponse<BatchRequestBody>(request);
    if (bodyOrResponse instanceof Response) {
      return bodyOrResponse;
    }

    const body = bodyOrResponse;

    const urls = normalizeDistinctUrlList(body.urls);
    const skipRefresh = body.skipRefresh === true;
    if (urls.length === 0) {
      return NextResponse.json([]);
    }

    if (urls.length > CONFIG.FEED_BATCH_MAX_URLS) {
      return NextResponse.json(
        {
          error: `A maximum of ${CONFIG.FEED_BATCH_MAX_URLS} feed URLs can be loaded at once`,
        },
        { status: 400 },
      );
    }

    const db = getDb();

    // Normalize all URLs up front so they match what's stored in the DB.
    const normalizedUrls: string[] = [];
    for (const url of urls) {
      try {
        normalizedUrls.push(normalizeFeedUrl(url));
      } catch {
        // Malformed URL — skip silently.
      }
    }

    if (normalizedUrls.length === 0) {
      return NextResponse.json([]);
    }

    // Single batch call: ~3 DB round-trips regardless of how many feeds.
    const batchMap = await fetchAndCacheFeedArticlesBatch(
      db,
      user.userId,
      normalizedUrls,
      { skipRefresh },
    );

    const results = normalizedUrls.map((normalizedUrl) => ({
      url: normalizedUrl,
      articles: batchMap.get(normalizedUrl) ?? [],
      // ok=false only when the URL was not found / not owned by the user;
      // an empty-but-valid feed is still ok=true so clients can distinguish
      // "fetched successfully but has no articles yet" from "auth/not-found".
      ok: batchMap.has(normalizedUrl),
    }));

    return NextResponse.json(results);
  } catch (error) {
    return logAndRespondError("Feed batch fetch error", error);
  }
}
