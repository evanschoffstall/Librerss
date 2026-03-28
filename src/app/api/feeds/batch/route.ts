import { NextRequest, NextResponse } from "next/server";

import { parseJsonObjectBodyOrResponse } from "@/lib/api/http";
import { CONFIG } from "@/lib/config";
import {
  type ArticleFilter,
  isArticleFilter,
} from "@/lib/core/article-filters";
import { fetchAndCacheFeedArticlesBatch } from "@/lib/core/feed-fetcher";
import { getDb } from "@/lib/db/db";
import { logger } from "@/lib/logger";
import {
  logAndRespondError,
  requireMutableAuthenticatedUser,
  resolveRouteHandlerDeps,
  type RouteHandlerContext,
} from "@/lib/server";
import { parseDateOrNull } from "@/lib/utils/dates";
import { normalizeDistinctUrlList, normalizeFeedUrl } from "@/lib/utils/url";

export interface BatchRouteDeps {
  fetchAndCacheFeedArticlesBatchFn?: typeof fetchAndCacheFeedArticlesBatch;
  getDbFn?: typeof getDb;
  logAndRespondErrorFn?: typeof logAndRespondError;
  requireMutableAuthenticatedUserFn?: typeof requireMutableAuthenticatedUser;
}

interface BatchRequestBody {
  articleFilter?: unknown;
  forceRefresh?: unknown;
  knownLastFetchedAtByUrl?: unknown;
  requestSource?: unknown;
  skipRefresh?: unknown;
  urls?: unknown;
}

interface BatchUrlDescriptor {
  kind: "invalid" | "valid";
  url: string;
}

export async function POST(
  request: NextRequest,
  depsOrContext: BatchRouteDeps | RouteHandlerContext = {},
) {
  const deps = resolveRouteHandlerDeps<BatchRouteDeps>(depsOrContext);
  try {
    const diagnosticsEnabled = CONFIG.FEED_REFRESH_DIAGNOSTICS_ENABLED;
    const requireMutableAuthenticatedUserForRoute =
      deps.requireMutableAuthenticatedUserFn ?? requireMutableAuthenticatedUser;
    const user = await requireMutableAuthenticatedUserForRoute(request, {
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
    const knownLastFetchedAtByUrlOrResponse = parseKnownLastFetchedAtByUrl(
      body.knownLastFetchedAtByUrl,
    );
    if (knownLastFetchedAtByUrlOrResponse instanceof Response) {
      return knownLastFetchedAtByUrlOrResponse;
    }

    const urls = normalizeDistinctUrlList(body.urls);
    const knownLastFetchedAtByUrl = knownLastFetchedAtByUrlOrResponse;
    const skipRefresh = body.skipRefresh === true;
    const forceRefresh = body.forceRefresh === true;
    const articleFilterOrResponse = parseArticleFilter(body.articleFilter);
    if (articleFilterOrResponse instanceof Response) {
      return articleFilterOrResponse;
    }
    const articleFilter = articleFilterOrResponse;
    const requestSource =
      typeof body.requestSource === "string"
        ? body.requestSource
        : "unspecified";

    if (diagnosticsEnabled) {
      logger.info("Feed batch request received", {
        articleFilter,
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

    const requestUrls = normalizeBatchRequestUrls(urls);
    const normalizedUrls = requestUrls
      .filter(
        (item): item is { kind: "valid"; url: string } => item.kind === "valid",
      )
      .map((item) => item.url);
    const invalidUrlCount = requestUrls.length - normalizedUrls.length;

    if (normalizedUrls.length === 0) {
      if (diagnosticsEnabled)
        logger.info(
          "Feed batch request had no valid URLs after normalization",
          { invalidUrlCount, userId: user.userId },
        );

      return NextResponse.json(
        requestUrls.map((item) => ({
          articles: [],
          error: "Invalid feed URL",
          ok: false,
          url: item.url,
        })),
        { status: 207 },
      );
    }

    const db = (deps.getDbFn ?? getDb)();
    const fetchAndCacheFeedArticlesBatchForRoute =
      deps.fetchAndCacheFeedArticlesBatchFn ?? fetchAndCacheFeedArticlesBatch;

    // Single batch call: ~3 DB round-trips regardless of how many feeds.
    const {
      articles: batchMap,
      cachedCount,
      cooldownLimitedCount,
      errors: upstreamErrors,
      lastFetchedByUrl,
      refreshedCount,
      resolution,
      unchangedUrls,
    } = await fetchAndCacheFeedArticlesBatchForRoute(
      db,
      user.userId,
      normalizedUrls,
      {
        articleFilter,
        forceRefresh,
        knownLastFetchedAtByUrl,
        requestSource,
        skipRefresh,
      },
    );

    const results = requestUrls.map((item) => {
      if (item.kind === "invalid") {
        return {
          articles: [],
          error: "Invalid feed URL",
          ok: false,
          url: item.url,
        };
      }

      const normalizedUrl = item.url;
      return {
        articles: batchMap.get(normalizedUrl) ?? [],
        // ok=false only when the URL was not found / not owned by the user;
        // an empty-but-valid feed is still ok=true so clients can distinguish
        // "fetched successfully but has no articles yet" from "auth/not-found".
        ok:
          batchMap.has(normalizedUrl) ||
          lastFetchedByUrl.has(normalizedUrl) ||
          unchangedUrls.has(normalizedUrl),
        url: normalizedUrl,
        ...(unchangedUrls.has(normalizedUrl) ? { unchanged: true } : {}),
        ...(lastFetchedByUrl.has(normalizedUrl)
          ? {
              lastFetchedAt: lastFetchedByUrl.get(normalizedUrl)?.toISOString(),
            }
          : {}),
        // Surface upstream fetch errors so the client can inform the user.
        ...(upstreamErrors.has(normalizedUrl)
          ? { error: upstreamErrors.get(normalizedUrl) }
          : {}),
      };
    });

    const hasRequestErrors = invalidUrlCount > 0;
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

    if (hasRequestErrors) {
      logger.warn(
        `Returning 207 Multi-Status — ${invalidUrlCount} invalid feed URL(s) were rejected before fetch`,
      );
    }

    if (diagnosticsEnabled) {
      logger.info("Feed batch request completed", {
        articleFilter,
        forceRefresh,
        invalidUrlCount,
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
      status: hasRequestErrors || hasUpstreamErrors ? 207 : 200,
    });
  } catch (error) {
    return (deps.logAndRespondErrorFn ?? logAndRespondError)(
      "Feed batch fetch error",
      error,
    );
  }
}

function normalizeBatchRequestUrls(urls: string[]): BatchUrlDescriptor[] {
  const descriptors: BatchUrlDescriptor[] = [];
  const seenNormalizedUrls = new Set<string>();

  for (const url of urls) {
    try {
      const normalizedUrl = normalizeFeedUrl(url);
      if (seenNormalizedUrls.has(normalizedUrl)) {
        continue;
      }

      seenNormalizedUrls.add(normalizedUrl);
      descriptors.push({ kind: "valid", url: normalizedUrl });
    } catch {
      descriptors.push({ kind: "invalid", url });
    }
  }

  return descriptors;
}

function parseArticleFilter(value: unknown): ArticleFilter | Response {
  if (value === undefined) {
    return "all";
  }

  if (!isArticleFilter(value)) {
    return NextResponse.json(
      {
        error: "articleFilter must be one of all, unread, read, or starred",
      },
      { status: 400 },
    );
  }

  return value;
}

function parseKnownLastFetchedAtByUrl(
  value: unknown,
): Map<string, Date> | Response {
  if (value === undefined) {
    return new Map();
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return NextResponse.json(
      {
        error:
          "knownLastFetchedAtByUrl must be an object mapping URLs to ISO dates",
      },
      { status: 400 },
    );
  }

  const parsedEntries = Object.entries(value as Record<string, unknown>).map(
    ([url, rawDate]) => {
      const parsedDate = parseDateOrNull(rawDate);
      return parsedDate ? ([url, parsedDate] as const) : null;
    },
  );

  if (parsedEntries.some((entry) => entry === null)) {
    return NextResponse.json(
      {
        error: "knownLastFetchedAtByUrl values must be valid ISO date strings",
      },
      { status: 400 },
    );
  }

  return new Map(
    parsedEntries.filter(
      (entry): entry is readonly [string, Date] => entry !== null,
    ),
  );
}
