import { requireSameOrigin } from "@/lib/auth/csrf";
import { getUserFromRequest } from "@/lib/auth/session";
import { CONFIG } from "@/lib/config";
import {
  getPlaceholderArticlesForSource,
  PLACEHOLDER_FEED_SOURCES,
  RUNTIME_FLAGS,
} from "@/lib/core/runtime";
import { getDb } from "@/lib/db/db";
import { articles, feedCategories, feeds, feedSources } from "@/lib/db/schema";
import { logger } from "@/lib/utils/logger";
import { rateLimiter } from "@/lib/utils/rate-limit";
import {
  sanitizeArticleContent,
  sanitizeArticleTitle,
} from "@/lib/utils/validation";
import axios from "axios";
import { and, desc, eq, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import Parser from "rss-parser";

const BLOCKED_HOST_PATTERNS = [
  /^localhost$/i,
  /^0\.0\.0\.0$/,
  /^127\./,
  /^10\./,
  /^169\.254\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[0-1])\./,
  /^::1$/i,
  /^fc/i,
  /^fd/i,
  /^fe80:/i,
];

function normalizeFeedUrl(raw: string): string {
  const parsed = new URL(raw.trim());
  parsed.hash = "";
  parsed.username = "";
  parsed.password = "";
  return parsed.toString().replace(/\/+$/, "");
}

function normalizeHostname(hostname: string): string {
  return hostname.trim().toLowerCase().replace(/\.$/, "");
}

function isBlockedFeedHost(hostname: string): boolean {
  const normalized = normalizeHostname(hostname);
  if (!normalized) {
    return true;
  }

  return (
    normalized === "localhost" ||
    normalized.endsWith(".local") ||
    BLOCKED_HOST_PATTERNS.some((pattern) => pattern.test(normalized))
  );
}

function isBlockedResolvedAddress(address: string): boolean {
  const normalized = address.trim().toLowerCase();
  const ipv4MappedPrefix = "::ffff:";

  if (normalized.startsWith(ipv4MappedPrefix)) {
    return isBlockedFeedHost(normalized.slice(ipv4MappedPrefix.length));
  }

  return isBlockedFeedHost(normalized);
}

// DNS cache for blocked address checks
const DNS_CACHE = new Map<
  string,
  { blocked: boolean; expiresAt: number }
>();

async function resolvesToBlockedAddress(hostname: string): Promise<boolean> {
  // Check cache first
  const cached = DNS_CACHE.get(hostname);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.blocked;
  }

  try {
    // DNS lookup with timeout
    const lookupPromise = lookup(hostname, { all: true, verbatim: true });
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error("DNS lookup timeout")),
        CONFIG.DNS_LOOKUP_TIMEOUT_MS,
      ),
    );

    const records = await Promise.race([lookupPromise, timeoutPromise]);
    const isBlocked = records.some((record) =>
      isBlockedResolvedAddress(record.address),
    );

    // Cache result
    DNS_CACHE.set(hostname, {
      blocked: isBlocked,
      expiresAt: Date.now() + CONFIG.DNS_CACHE_TTL_MS,
    });

    return isBlocked;
  } catch (error) {
    // Fail open for transient DNS errors (allow the feed)
    // but log the issue for monitoring
    logger.warn("DNS lookup failed for feed validation", {
      hostname,
      error: error instanceof Error ? error.message : String(error),
    });

    // Cache negative result briefly to avoid repeated failures
    DNS_CACHE.set(hostname, {
      blocked: false,
      expiresAt: Date.now() + 60000, // 1 minute for errors
    });

    return false;
  }
}

async function isAllowedFeedUrl(raw: string): Promise<boolean> {
  try {
    const parsed = new URL(raw);
    const hasSupportedProtocol =
      parsed.protocol === "http:" || parsed.protocol === "https:";

    if (!hasSupportedProtocol) {
      return false;
    }

    if (parsed.username || parsed.password) {
      return false;
    }

    const normalizedHostname = normalizeHostname(parsed.hostname);
    if (isBlockedFeedHost(normalizedHostname)) {
      return false;
    }

    if (isIP(normalizedHostname)) {
      return !isBlockedResolvedAddress(normalizedHostname);
    }

    return !(await resolvesToBlockedAddress(normalizedHostname));
  } catch {
    return false;
  }
}

function isAllowedArticleLink(raw: string): boolean {
  try {
    const parsed = new URL(raw);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

const parser = new Parser();

function parseFeedItemDate(value: string | undefined, fallback: Date): Date {
  if (!value) {
    return fallback;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}

type PendingArticle = {
  title: string;
  link: string;
  publicationDate: Date;
  content: string;
  feedId: number;
  lastChecked: Date;
};

function dedupePendingArticles(items: PendingArticle[]): PendingArticle[] {
  const byLink = new Map<string, PendingArticle>();

  for (const item of items) {
    const normalizedLink = item.link.trim();
    if (!normalizedLink) {
      continue;
    }

    const current = byLink.get(normalizedLink);
    if (!current) {
      byLink.set(normalizedLink, {
        ...item,
        link: normalizedLink,
      });
      continue;
    }

    const currentPublication = new Date(current.publicationDate).getTime();
    const nextPublication = new Date(item.publicationDate).getTime();
    const shouldReplace =
      nextPublication > currentPublication ||
      item.content.length > current.content.length;

    if (shouldReplace) {
      byLink.set(normalizedLink, {
        ...item,
        link: normalizedLink,
      });
    }
  }

  return [...byLink.values()];
}

export async function GET(request: NextRequest) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const requestUrl = new URL(request.url);
    const feedUrl = requestUrl.searchParams.get("url")?.trim();

    if (feedUrl && !(await isAllowedFeedUrl(feedUrl))) {
      return NextResponse.json(
        {
          error: "Feed URL must use http or https and resolve to a public host",
        },
        { status: 400 },
      );
    }

    const normalizedFeedUrl = feedUrl ? normalizeFeedUrl(feedUrl) : null;

    if (RUNTIME_FLAGS.usePlaceholderData) {
      if (!normalizedFeedUrl) {
        return NextResponse.json(PLACEHOLDER_FEED_SOURCES);
      }

      return NextResponse.json(
        getPlaceholderArticlesForSource(normalizedFeedUrl),
      );
    }

    const db = getDb();

    if (!normalizedFeedUrl) {
      const sources = await db
        .select({
          id: feedSources.id,
          name: feedSources.name,
          url: feedSources.url,
          category: feedCategories.category,
        })
        .from(feedSources)
        .leftJoin(feeds, eq(feeds.url, feedSources.url))
        .leftJoin(
          feedCategories,
          and(
            eq(feedCategories.feedId, feeds.id),
            eq(feedCategories.userId, user.userId),
          ),
        )
        .where(eq(feedSources.userId, user.userId))
        .orderBy(feedSources.name);

      return NextResponse.json(sources);
    }

    const [userSource] = await db
      .select({ id: feedSources.id })
      .from(feedSources)
      .where(
        and(
          eq(feedSources.userId, user.userId),
          eq(feedSources.url, normalizedFeedUrl),
        ),
      )
      .limit(1);

    if (!userSource) {
      return NextResponse.json(
        { error: "Feed source not found" },
        { status: 404 },
      );
    }

    const [existingFeed] = await db
      .select({ id: feeds.id, url: feeds.url, lastFetched: feeds.lastFetched })
      .from(feeds)
      .where(eq(feeds.url, normalizedFeedUrl))
      .limit(1);

    let currentFeed = existingFeed;
    let shouldFetch = true;

    if (currentFeed) {
      const diffMinutes =
        (Date.now() - new Date(currentFeed.lastFetched).getTime()) / 60000;
      if (diffMinutes < CONFIG.FEED_CACHE_TTL_MINUTES) {
        shouldFetch = false;
      }
    } else {
      const [createdFeed] = await db
        .insert(feeds)
        .values({ url: normalizedFeedUrl })
        .onConflictDoNothing({ target: feeds.url })
        .returning({
          id: feeds.id,
          url: feeds.url,
          lastFetched: feeds.lastFetched,
        });

      if (createdFeed) {
        currentFeed = createdFeed;
      } else {
        const [persistedFeed] = await db
          .select({
            id: feeds.id,
            url: feeds.url,
            lastFetched: feeds.lastFetched,
          })
          .from(feeds)
          .where(eq(feeds.url, normalizedFeedUrl))
          .limit(1);
        currentFeed = persistedFeed;
      }
    }

    if (!currentFeed) {
      throw new Error("Unable to resolve feed record");
    }

    if (shouldFetch) {
      const feedResponse = await axios.get(normalizedFeedUrl, {
        timeout: CONFIG.FEED_REQUEST_TIMEOUT_MS,
        maxContentLength: CONFIG.MAX_FEED_RESPONSE_SIZE_BYTES,
        maxRedirects: 3,
        beforeRedirect: (options) => {
          const protocol = options.protocol?.toLowerCase() ?? "";
          const hostname = normalizeHostname(options.hostname ?? "");

          const hasSupportedProtocol =
            protocol === "http:" || protocol === "https:";
          if (!hasSupportedProtocol || isBlockedFeedHost(hostname)) {
            throw new Error("Blocked redirect target");
          }
        },
      });
      const feedResponseParsed = await parser.parseString(feedResponse.data);
      const now = new Date();

      const validItems = dedupePendingArticles(
        feedResponseParsed.items
          .filter(
            (item) =>
              Boolean(item.title) &&
              Boolean(item.link) &&
              isAllowedArticleLink(item.link ?? ""),
          )
          .map((item) => ({
            title: sanitizeArticleTitle(item.title),
            link: item.link!,
            publicationDate: parseFeedItemDate(
              item.isoDate ?? item.pubDate,
              now,
            ),
            content: sanitizeArticleContent(
              item.content || item.contentSnippet || "",
            ),
            feedId: currentFeed.id,
            lastChecked: now,
          })),
      );

      if (validItems.length > 0) {
        await db
          .insert(articles)
          .values(validItems)
          .onConflictDoUpdate({
            target: articles.link,
            set: {
              title: sql`excluded.title`,
              publicationDate: sql`excluded.publication_date`,
              content: sql`excluded.content`,
              lastChecked: sql`excluded.last_checked`,
            },
          });
      }

      await db
        .update(feeds)
        .set({ lastFetched: now })
        .where(eq(feeds.url, normalizedFeedUrl));
    }

    const feedArticles = await db
      .select({
        id: articles.id,
        title: articles.title,
        link: articles.link,
        content: articles.content,
        publicationDate: articles.publicationDate,
        feedId: articles.feedId,
        lastChecked: articles.lastChecked,
      })
      .from(articles)
      .where(eq(articles.feedId, currentFeed.id))
      .orderBy(desc(articles.publicationDate));

    return NextResponse.json(feedArticles);
  } catch (error) {
    logger.error("Error fetching feed", {
      error: error instanceof Error ? error : new Error(String(error)),
    });

    if (axios.isAxiosError(error)) {
      return NextResponse.json(
        { error: "Unable to fetch upstream feed" },
        { status: 502 },
      );
    }

    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    // Rate limiting
    const rateLimitError = rateLimiter.check(request, "feed-create", {
      windowMs: CONFIG.RATE_LIMIT_FEED_WINDOW_MS,
      maxAttempts: CONFIG.RATE_LIMIT_FEED_MAX_REQUESTS,
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

    if (RUNTIME_FLAGS.usePlaceholderData) {
      return NextResponse.json(
        {
          error:
            "Feed source management is disabled when DATABASE_URL is not configured",
        },
        { status: 503 },
      );
    }

    const db = getDb();

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const payload = body as Record<string, unknown>;
    const name = typeof payload.name === "string" ? payload.name.trim() : "";
    const url = typeof payload.url === "string" ? payload.url.trim() : "";
    const category =
      typeof payload.category === "string" && payload.category.trim()
        ? payload.category.trim()
        : "My Feeds";

    if (!name || !url) {
      return NextResponse.json(
        { error: "Both name and url are required" },
        { status: 400 },
      );
    }

    if (
      name.length > CONFIG.MAX_FEED_NAME_LENGTH ||
      category.length > CONFIG.MAX_CATEGORY_NAME_LENGTH
    ) {
      return NextResponse.json(
        {
          error: `name and category must be ${CONFIG.MAX_FEED_NAME_LENGTH} characters or less`,
        },
        { status: 400 },
      );
    }

    if (!(await isAllowedFeedUrl(url))) {
      return NextResponse.json(
        {
          error: "Feed URL must use http or https and resolve to a public host",
        },
        { status: 400 },
      );
    }

    const normalizedUrl = normalizeFeedUrl(url);

    const [existingSource] = await db
      .select({
        id: feedSources.id,
        name: feedSources.name,
        url: feedSources.url,
      })
      .from(feedSources)
      .where(
        and(
          eq(feedSources.userId, user.userId),
          eq(feedSources.url, normalizedUrl),
        ),
      )
      .limit(1);

    const [existingFeed] = await db
      .select({ id: feeds.id })
      .from(feeds)
      .where(eq(feeds.url, normalizedUrl))
      .limit(1);

    let sourceFeedId = existingFeed?.id;

    if (!sourceFeedId) {
      const [createdFeed] = await db
        .insert(feeds)
        .values({ url: normalizedUrl })
        .onConflictDoNothing({ target: feeds.url })
        .returning({ id: feeds.id });

      if (createdFeed) {
        sourceFeedId = createdFeed.id;
      } else {
        const [persistedFeed] = await db
          .select({ id: feeds.id })
          .from(feeds)
          .where(eq(feeds.url, normalizedUrl))
          .limit(1);
        sourceFeedId = persistedFeed?.id;
      }
    }

    if (!sourceFeedId) {
      throw new Error("Unable to resolve feed source id");
    }

    const sourceRecord = await db.transaction(async (tx) => {
      await tx
        .delete(feedCategories)
        .where(
          and(
            eq(feedCategories.userId, user.userId),
            eq(feedCategories.feedId, sourceFeedId),
          ),
        );

      await tx.insert(feedCategories).values({
        userId: user.userId,
        feedId: sourceFeedId,
        category,
      });

      if (existingSource) {
        const [updatedSource] = await tx
          .update(feedSources)
          .set({ name })
          .where(
            and(
              eq(feedSources.id, existingSource.id),
              eq(feedSources.userId, user.userId),
            ),
          )
          .returning({
            id: feedSources.id,
            name: feedSources.name,
            url: feedSources.url,
          });

        if (!updatedSource) {
          throw new Error("Failed to update feed source");
        }

        return updatedSource;
      }

      const [createdSource] = await tx
        .insert(feedSources)
        .values({ userId: user.userId, name, url: normalizedUrl })
        .returning({
          id: feedSources.id,
          name: feedSources.name,
          url: feedSources.url,
        });

      if (!createdSource) {
        throw new Error("Failed to create feed source");
      }

      return createdSource;
    });

    return NextResponse.json(
      { ...sourceRecord, category },
      { status: existingSource ? 200 : 201 },
    );
  } catch (error) {
    logger.error("Error creating feed source", {
      error: error instanceof Error ? error : new Error(String(error)),
    });
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const csrfError = requireSameOrigin(request);
    if (csrfError) {
      return csrfError;
    }

    const user = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (RUNTIME_FLAGS.usePlaceholderData) {
      return NextResponse.json(
        {
          error:
            "Feed source management is disabled when DATABASE_URL is not configured",
        },
        { status: 503 },
      );
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const payload = body as Record<string, unknown>;
    const sourceId = Number(payload.id);
    const name = typeof payload.name === "string" ? payload.name.trim() : "";

    if (!Number.isInteger(sourceId) || sourceId <= 0) {
      return NextResponse.json(
        { error: "A valid id is required" },
        { status: 400 },
      );
    }

    if (!name) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }

    if (name.length > CONFIG.MAX_FEED_NAME_LENGTH) {
      return NextResponse.json(
        {
          error: `name must be ${CONFIG.MAX_FEED_NAME_LENGTH} characters or less`,
        },
        { status: 400 },
      );
    }

    const db = getDb();

    const [updatedSource] = await db
      .update(feedSources)
      .set({ name })
      .where(
        and(eq(feedSources.id, sourceId), eq(feedSources.userId, user.userId)),
      )
      .returning({
        id: feedSources.id,
        name: feedSources.name,
        url: feedSources.url,
      });

    if (!updatedSource) {
      return NextResponse.json(
        { error: "Feed source not found" },
        { status: 404 },
      );
    }

    return NextResponse.json(updatedSource);
  } catch (error) {
    logger.error("Error renaming feed source", {
      error: error instanceof Error ? error : new Error(String(error)),
    });
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const csrfError = requireSameOrigin(request);
    if (csrfError) {
      return csrfError;
    }

    const user = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (RUNTIME_FLAGS.usePlaceholderData) {
      return NextResponse.json(
        {
          error:
            "Feed source management is disabled when DATABASE_URL is not configured",
        },
        { status: 503 },
      );
    }

    const db = getDb();

    const requestUrl = new URL(request.url);
    const sourceId = Number(requestUrl.searchParams.get("id"));

    if (!Number.isInteger(sourceId) || sourceId <= 0) {
      return NextResponse.json(
        { error: "A valid id query parameter is required" },
        { status: 400 },
      );
    }

    const [sourceToDelete] = await db
      .select({
        id: feedSources.id,
        name: feedSources.name,
        url: feedSources.url,
      })
      .from(feedSources)
      .where(
        and(eq(feedSources.id, sourceId), eq(feedSources.userId, user.userId)),
      )
      .limit(1);

    if (!sourceToDelete) {
      return NextResponse.json(
        { error: "Feed source not found" },
        { status: 404 },
      );
    }

    const [feedForSource] = await db
      .select({ id: feeds.id })
      .from(feeds)
      .where(eq(feeds.url, sourceToDelete.url))
      .limit(1);

    if (feedForSource) {
      await db
        .delete(feedCategories)
        .where(
          and(
            eq(feedCategories.userId, user.userId),
            eq(feedCategories.feedId, feedForSource.id),
          ),
        );
    }

    const [deletedSource] = await db
      .delete(feedSources)
      .where(
        and(eq(feedSources.id, sourceId), eq(feedSources.userId, user.userId)),
      )
      .returning({
        id: feedSources.id,
        name: feedSources.name,
        url: feedSources.url,
      });

    return NextResponse.json(deletedSource);
  } catch (error) {
    logger.error("Error deleting feed source", {
      error: error instanceof Error ? error : new Error(String(error)),
    });
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
