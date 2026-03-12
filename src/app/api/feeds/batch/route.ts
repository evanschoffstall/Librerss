import { NextRequest, NextResponse } from "next/server";

import { parseJsonObjectBodyOrResponse } from "@/lib/api/http";
import { CONFIG } from "@/lib/config";
import { fetchAndCacheFeedArticlesBatch } from "@/lib/core/feed-fetcher";
import { getDb } from "@/lib/db/db";
import { logger } from "@/lib/logger";
import {
  logAndRespondError,
  requireMutableAuthenticatedUser,
} from "@/lib/server";
import { normalizeDistinctUrlList, normalizeFeedUrl } from "@/lib/utils/url";

const DIAG = CONFIG.FEED_REFRESH_DIAGNOSTICS_ENABLED;

interface BatchRequestBody {
  forceRefresh?: unknown;
  requestSource?: unknown;
  skipRefresh?: unknown;
  urls?: unknown;
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireMutableAuthenticatedUser(request, {
      rateLimit: {
        key: "feed-batch",
        maxAttempts: CONFIG.RATE_LIMIT_FEED_BATCH_MAX_REQUESTS,
        scope: "user",
        windowMs: CONFIG.RATE_LIMIT_FEED_BATCH_WINDOW_MS,
      },
    });
    if (user instanceof Response) return user;

    const bodyOrResponse = await parseJsonObjectBodyOrResponse(request);
    if (bodyOrResponse instanceof Response) return bodyOrResponse;

    const body = bodyOrResponse as BatchRequestBody;
    const urls = normalizeDistinctUrlList(body.urls);
    const skipRefresh = body.skipRefresh === true;
    const forceRefresh = body.forceRefresh === true;
    const requestSource =
      typeof body.requestSource === "string"
        ? body.requestSource
        : "unspecified";

    if (DIAG) {
      logger.info("Feed batch request received", {
        forceRefresh,
        requestedUrlCount: urls.length,
        requestSource,
        skipRefresh,
        userId: user.userId,
      });
    }

    const intent = forceRefresh ? "force" : skipRefresh ? "skip" : "auto";

    if (urls.length === 0) {
      logger.info(`Batch [0 feeds]: client=${intent} | empty request`);
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

    // Normalize URLs up front so they match what's stored in the DB.
    const normalizedUrls = urls.flatMap((url) => {
      try {
        return [normalizeFeedUrl(url)];
      } catch {
        // Malformed URL — skip silently; client will see empty result for this URL
        return [];
      }
    });

    if (normalizedUrls.length === 0) {
      if (DIAG)
        logger.info(
          "Feed batch request had no valid URLs after normalization",
          { userId: user.userId },
        );
      return NextResponse.json([]);
    }

    const db = getDb();

    // Single batch call: ~3 DB round-trips regardless of how many feeds.
    const {
      articles: batchMap,
      cachedCount,
      cooldownLimitedCount,
      errors: upstreamErrors,
      lastFetchedByUrl,
      refreshedCount,
      resolution,
    } = await fetchAndCacheFeedArticlesBatch(db, user.userId, normalizedUrls, {
      forceRefresh,
      requestSource,
      skipRefresh,
    });

    const results = normalizedUrls.map((normalizedUrl) => ({
      articles: batchMap.get(normalizedUrl) ?? [],
      // ok=false only when the URL was not found / not owned by the user;
      // an empty-but-valid feed is still ok=true so clients can distinguish
      // "fetched successfully but has no articles yet" from "auth/not-found".
      ok: batchMap.has(normalizedUrl),
      url: normalizedUrl,
      ...(lastFetchedByUrl.has(normalizedUrl)
        ? { lastFetchedAt: lastFetchedByUrl.get(normalizedUrl)?.toISOString() }
        : {}),
      // Surface upstream fetch errors so the client can inform the user.
      ...(upstreamErrors.has(normalizedUrl)
        ? { error: upstreamErrors.get(normalizedUrl) }
        : {}),
    }));

    const hasUpstreamErrors = upstreamErrors.size > 0;

    // Always log cache/refresh breakdown for feed batch requests.
    const n = normalizedUrls.length;
    const plural = n !== 1 ? "s" : "";
    const cooldownNote =
      cooldownLimitedCount > 0
        ? `, ${cooldownLimitedCount === n ? "all" : cooldownLimitedCount} throttled`
        : "";
    logger.info(
      `Batch [${n} feed${plural}]: client=${intent} resolved=${resolution} | ${refreshedCount} refreshed, ${cachedCount} cached${cooldownNote}`,
    );

    if (hasUpstreamErrors) {
      const failures = [...upstreamErrors.entries()].map(
        ([url, err]) => `  • ${url}: ${err}`,
      );
      logger.warn(
        `Returning 207 Multi-Status — ${upstreamErrors.size} feed(s) have upstream errors:\n${failures.join("\n")}`,
      );
    }

    if (DIAG) {
      logger.info("Feed batch request completed", {
        forceRefresh,
        missingCount: results.filter((item) => !item.ok).length,
        normalizedUrlCount: normalizedUrls.length,
        okCount: results.filter((item) => item.ok).length,
        requestSource,
        skipRefresh,
        totalArticles: results.reduce(
          (sum, item) => sum + item.articles.length,
          0,
        ),
        upstreamErrorCount: upstreamErrors.size,
        userId: user.userId,
      });
    }

    // Return 207 Multi-Status when some feeds had upstream errors so
    // clients can distinguish partial failures from full success.
    return NextResponse.json(results, {
      status: hasUpstreamErrors ? 207 : 200,
    });
  } catch (error) {
    return logAndRespondError("Feed batch fetch error", error);
  }
}
