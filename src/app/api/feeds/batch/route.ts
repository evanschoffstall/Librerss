import { parseJsonBodyOrResponse } from "@/lib/api/request";
import {
  logAndRespondError,
  requireMutableAuthenticatedUser,
} from "@/lib/api/route-helpers";
import { CONFIG } from "@/lib/config";
import { fetchAndCacheFeedArticlesBatch } from "@/lib/core/feed-fetcher";
import { getDb } from "@/lib/db/db";
import { logger } from "@/lib/utils/logger";
import { normalizeDistinctUrlList, normalizeFeedUrl } from "@/lib/utils/url";
import { NextRequest, NextResponse } from "next/server";

const DIAG = CONFIG.FEED_REFRESH_DIAGNOSTICS_ENABLED;

type BatchRequestBody = {
  urls?: unknown;
  skipRefresh?: unknown;
  forceRefresh?: unknown;
  requestSource?: unknown;
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
    const forceRefresh = body.forceRefresh === true;
    const requestSource =
      typeof body.requestSource === "string"
        ? body.requestSource
        : "unspecified";
    if (DIAG) {
      logger.info("Feed batch request received", {
        userId: user.userId,
        requestedUrlCount: urls.length,
        skipRefresh,
        forceRefresh,
        requestSource,
      });
    }

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
      if (DIAG) {
        logger.info(
          "Feed batch request had no valid URLs after normalization",
          {
            userId: user.userId,
          },
        );
      }
      return NextResponse.json([]);
    }

    // Single batch call: ~3 DB round-trips regardless of how many feeds.
    const {
      articles: batchMap,
      errors: upstreamErrors,
      refreshedCount,
      cachedCount,
      lastFetchedByUrl,
    } = await fetchAndCacheFeedArticlesBatch(db, user.userId, normalizedUrls, {
      skipRefresh,
      forceRefresh,
      requestSource,
    });

    const results = normalizedUrls.map((normalizedUrl) => ({
      url: normalizedUrl,
      articles: batchMap.get(normalizedUrl) ?? [],
      // ok=false only when the URL was not found / not owned by the user;
      // an empty-but-valid feed is still ok=true so clients can distinguish
      // "fetched successfully but has no articles yet" from "auth/not-found".
      ok: batchMap.has(normalizedUrl),
      ...(lastFetchedByUrl.has(normalizedUrl)
        ? {
            lastFetchedAt: lastFetchedByUrl.get(normalizedUrl)?.toISOString(),
          }
        : {}),
      // Surface upstream fetch errors so the client can inform the user.
      ...(upstreamErrors.has(normalizedUrl)
        ? { error: upstreamErrors.get(normalizedUrl) }
        : {}),
    }));

    const hasUpstreamErrors = upstreamErrors.size > 0;

    // Always log cache/refresh breakdown for feed batch requests
    const flags = [];
    if (forceRefresh) flags.push("force");
    if (skipRefresh) flags.push("skip refresh");
    const flagStr = flags.length > 0 ? ` [${flags.join(", ")}]` : "";

    logger.info(
      `📦 Batch [${normalizedUrls.length} feed${normalizedUrls.length !== 1 ? "s" : ""}]: ${refreshedCount} refreshed, ${cachedCount} cached${flagStr}`,
    );

    // Always log 207 reasons so they appear in the server console alongside
    // the Next.js request line, regardless of diagnostics toggle.
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
        userId: user.userId,
        normalizedUrlCount: normalizedUrls.length,
        okCount: results.filter((item) => item.ok).length,
        missingCount: results.filter((item) => !item.ok).length,
        upstreamErrorCount: upstreamErrors.size,
        totalArticles: results.reduce(
          (sum, item) => sum + item.articles.length,
          0,
        ),
        skipRefresh,
        forceRefresh,
        requestSource,
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
