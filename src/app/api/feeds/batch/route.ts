import { parseJsonBody } from "@/lib/api/request";
import { requireSameOrigin } from "@/lib/auth/csrf";
import { getUserFromRequest } from "@/lib/auth/session";
import { CONFIG } from "@/lib/config";
import { fetchAndCacheFeedArticlesBatch } from "@/lib/core/feedFetcher";
import { getDb } from "@/lib/db/db";
import { logger } from "@/lib/utils/logger";
import { rateLimiter } from "@/lib/utils/rate-limit";
import { normalizeFeedUrl } from "@/lib/utils/url";
import { NextRequest, NextResponse } from "next/server";

type BatchRequestBody = {
  urls?: unknown;
  skipRefresh?: unknown;
};

function normalizeUrlList(urls: unknown): string[] {
  if (!Array.isArray(urls)) {
    return [];
  }

  return Array.from(
    new Set(
      urls
        .filter((url): url is string => typeof url === "string")
        .map((url) => url.trim())
        .filter(Boolean),
    ),
  );
}

export async function POST(request: NextRequest) {
  try {
    const rateLimitError = rateLimiter.check(request, "feed-batch", {
      windowMs: CONFIG.RATE_LIMIT_FEED_BATCH_WINDOW_MS,
      maxAttempts: CONFIG.RATE_LIMIT_FEED_BATCH_MAX_REQUESTS,
    });
    if (rateLimitError) {
      return rateLimitError;
    }

    const csrfError = requireSameOrigin(request);
    if (csrfError) {
      return csrfError;
    }

    const user = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const parsedBody = await parseJsonBody<BatchRequestBody>(request);
    if (!parsedBody.ok) {
      return parsedBody.response;
    }

    const body = parsedBody.data;

    const urls = normalizeUrlList(body.urls);
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
    logger.error("Feed batch fetch error", {
      error: error instanceof Error ? error : new Error(String(error)),
    });
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
