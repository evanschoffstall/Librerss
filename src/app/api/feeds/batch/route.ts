import { requireSameOrigin } from "@/lib/auth/csrf";
import { getUserFromRequest } from "@/lib/auth/session";
import { CONFIG } from "@/lib/config";
import {
  fetchAndCacheFeedArticles,
  normalizeFeedUrl,
} from "@/lib/core/feedFetcher";
import { getDb } from "@/lib/db/db";
import { logger } from "@/lib/utils/logger";
import { NextRequest, NextResponse } from "next/server";

type BatchRequestBody = {
  urls?: unknown;
};

type BatchFeedResult = {
  url: string;
  articles: unknown[];
  ok: boolean;
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

async function mapWithConcurrency<TInput, TOutput>(
  items: TInput[],
  concurrency: number,
  mapper: (item: TInput, index: number) => Promise<TOutput>,
): Promise<TOutput[]> {
  if (items.length === 0) {
    return [];
  }

  const results = new Array<TOutput>(items.length);
  let nextIndex = 0;

  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    async () => {
      while (true) {
        const currentIndex = nextIndex;
        nextIndex += 1;

        if (currentIndex >= items.length) {
          return;
        }

        results[currentIndex] = await mapper(items[currentIndex], currentIndex);
      }
    },
  );

  await Promise.all(workers);
  return results;
}

export async function POST(request: NextRequest) {
  try {
    const csrfError = requireSameOrigin(request);
    if (csrfError) {
      return csrfError;
    }

    const user = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let body: BatchRequestBody;
    try {
      body = (await request.json()) as BatchRequestBody;
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const urls = normalizeUrlList(body.urls);
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

    const results = await mapWithConcurrency(
      urls,
      CONFIG.FEED_BATCH_CONCURRENCY,
      async (url): Promise<BatchFeedResult> => {
        // Normalize the URL to match what's stored in the DB.
        let normalized: string;
        try {
          normalized = normalizeFeedUrl(url);
        } catch {
          return { url, articles: [], ok: false };
        }

        try {
          const articles = await fetchAndCacheFeedArticles(
            db,
            user.userId,
            normalized,
          );
          return { url: normalized, articles, ok: true };
        } catch {
          return { url: normalized, articles: [], ok: false };
        }
      },
    );

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
