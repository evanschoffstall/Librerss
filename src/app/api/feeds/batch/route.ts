import { requireSameOrigin } from "@/lib/auth/csrf";
import { getUserFromRequest } from "@/lib/auth/session";
import { NextRequest, NextResponse } from "next/server";

type BatchRequestBody = {
  urls?: unknown;
};

type BatchFeedResult = {
  url: string;
  articles: unknown[];
  ok: boolean;
};

const MAX_BATCH_SIZE = 64;
const FETCH_TIMEOUT_MS = 12000;
const DEFAULT_CONCURRENCY = 8;

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

async function fetchFeedForUrl(
  request: NextRequest,
  url: string,
): Promise<BatchFeedResult> {
  const endpoint = new URL("/api/feeds", request.nextUrl.origin);
  endpoint.searchParams.set("url", url);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(endpoint.toString(), {
      method: "GET",
      cache: "no-store",
      signal: controller.signal,
      headers: {
        cookie: request.headers.get("cookie") ?? "",
      },
    });

    if (!response.ok) {
      return { url, articles: [], ok: false };
    }

    const data: unknown = await response.json();
    if (!Array.isArray(data)) {
      return { url, articles: [], ok: false };
    }

    return { url, articles: data, ok: true };
  } catch {
    return { url, articles: [], ok: false };
  } finally {
    clearTimeout(timeoutId);
  }
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

    if (urls.length > MAX_BATCH_SIZE) {
      return NextResponse.json(
        {
          error: `A maximum of ${MAX_BATCH_SIZE} feed URLs can be loaded at once`,
        },
        { status: 400 },
      );
    }

    const results = await mapWithConcurrency(urls, DEFAULT_CONCURRENCY, (url) =>
      fetchFeedForUrl(request, url),
    );

    return NextResponse.json(results);
  } catch (error) {
    console.error("Feed batch fetch error:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
