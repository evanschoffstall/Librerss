/**
 * Shared feed-fetching logic.
 *
 * Extracted so that both /api/feeds (single URL) and /api/feeds/batch (many
 * URLs) can call it as a plain function instead of going through an in-process
 * HTTP round-trip, which was the previous batch implementation.
 */

import { CONFIG } from "@/lib/config";
import type { getDb } from "@/lib/db/db";
import { articles, feeds, feedSources } from "@/lib/db/schema";
import { logger } from "@/lib/utils/logger";
import {
  isBlockedHost,
  isBlockedResolvedAddress,
  normalizeHostname,
} from "@/lib/utils/ssrf";
import {
  sanitizeArticleContent,
  sanitizeArticleTitle,
} from "@/lib/utils/validation";
import axios from "axios";
import { and, desc, eq, sql } from "drizzle-orm";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import Parser from "rss-parser";
import sanitizeHtml from "sanitize-html";

// ─── DNS cache ────────────────────────────────────────────────────────────────
// Module-level so it persists across requests within the same process.

const DNS_CACHE = new Map<string, { blocked: boolean; expiresAt: number }>();
const DNS_CACHE_MAX_ENTRIES = 10_000;

function setCacheSafe(
  key: string,
  value: { blocked: boolean; expiresAt: number },
): void {
  if (DNS_CACHE.size >= DNS_CACHE_MAX_ENTRIES) {
    const now = Date.now();
    for (const [k, entry] of DNS_CACHE.entries()) {
      if (entry.expiresAt <= now) DNS_CACHE.delete(k);
    }
    if (DNS_CACHE.size >= DNS_CACHE_MAX_ENTRIES) DNS_CACHE.clear();
  }
  DNS_CACHE.set(key, value);
}

async function resolvesToBlockedAddress(hostname: string): Promise<boolean> {
  const cached = DNS_CACHE.get(hostname);
  if (cached && cached.expiresAt > Date.now()) return cached.blocked;

  try {
    const lookupPromise = lookup(hostname, { all: true, verbatim: true });
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error("DNS lookup timeout")),
        CONFIG.DNS_LOOKUP_TIMEOUT_MS,
      ),
    );

    const records = await Promise.race([lookupPromise, timeoutPromise]);
    const isBlocked = records.some((r) => isBlockedResolvedAddress(r.address));

    setCacheSafe(hostname, {
      blocked: isBlocked,
      expiresAt: Date.now() + CONFIG.DNS_CACHE_TTL_MS,
    });

    return isBlocked;
  } catch (error) {
    logger.warn("DNS lookup failed for feed validation", {
      hostname,
      error: error instanceof Error ? error.message : String(error),
    });
    setCacheSafe(hostname, {
      blocked: false,
      expiresAt: Date.now() + 60_000,
    });
    return false;
  }
}

// ─── URL validation ───────────────────────────────────────────────────────────

export async function isAllowedFeedUrl(raw: string): Promise<boolean> {
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:")
      return false;
    if (parsed.username || parsed.password) return false;

    const host = normalizeHostname(parsed.hostname);
    if (isBlockedHost(host)) return false;
    if (isIP(host)) return !isBlockedResolvedAddress(host);

    return !(await resolvesToBlockedAddress(host));
  } catch {
    return false;
  }
}

export function isAllowedArticleLink(raw: string): boolean {
  try {
    const parsed = new URL(raw);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

// ─── Feed URL normalization ───────────────────────────────────────────────────

export function normalizeFeedUrl(raw: string): string {
  const parsed = new URL(raw.trim());
  parsed.hash = "";
  parsed.username = "";
  parsed.password = "";
  return parsed.toString().replace(/\/+$/, "");
}

// ─── HTML sanitization ───────────────────────────────────────────────────────

function sanitizeRssHtml(raw: string): string {
  if (!raw.trim()) return "";
  return sanitizeHtml(raw, {
    allowedTags: [
      "p",
      "br",
      "h1",
      "h2",
      "h3",
      "h4",
      "h5",
      "h6",
      "ul",
      "ol",
      "li",
      "blockquote",
      "pre",
      "code",
      "strong",
      "em",
      "b",
      "i",
      "u",
      "a",
      "hr",
      "figure",
      "figcaption",
    ],
    allowedAttributes: {
      a: ["href", "name", "target", "rel"],
      code: ["class"],
      pre: ["class"],
    },
    allowedSchemes: ["http", "https", "mailto"],
    transformTags: {
      a: (tagName: string, attribs: Record<string, string>) => ({
        tagName,
        attribs: {
          ...attribs,
          rel: "noopener noreferrer nofollow",
          target: "_blank",
        },
      }),
    },
  }).trim();
}

// ─── Date helpers ─────────────────────────────────────────────────────────────

function parseFeedItemDate(value: string | undefined, fallback: Date): Date {
  if (!value) return fallback;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}

// ─── Article deduplication ────────────────────────────────────────────────────

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
    if (!normalizedLink) continue;

    const current = byLink.get(normalizedLink);
    if (!current) {
      byLink.set(normalizedLink, { ...item, link: normalizedLink });
      continue;
    }

    const shouldReplace =
      new Date(item.publicationDate).getTime() >
        new Date(current.publicationDate).getTime() ||
      item.content.length > current.content.length;

    if (shouldReplace)
      byLink.set(normalizedLink, { ...item, link: normalizedLink });
  }

  return [...byLink.values()];
}

// ─── RSS parser singleton ─────────────────────────────────────────────────────

const parser = new Parser();

// ─── Public types ─────────────────────────────────────────────────────────────

export type ArticleRow = {
  id: number;
  title: string;
  link: string;
  content: string;
  publicationDate: Date;
  feedId: number;
  lastChecked: Date;
};

/** Returned when the authenticated user doesn't own the requested feed source. */
export class FeedSourceNotFoundError extends Error {
  constructor(feedUrl: string) {
    super(`Feed source not found for URL: ${feedUrl}`);
    this.name = "FeedSourceNotFoundError";
  }
}

// ─── Max articles returned per feed ──────────────────────────────────────────

const MAX_ARTICLES_PER_FEED = 200;

// ─── Core: fetch + cache a single feed ───────────────────────────────────────

/**
 * Fetches and caches articles for one feed URL.
 *
 * - Verifies the authenticated user owns the feed source.
 * - Creates the Feed record if it doesn't exist yet.
 * - Refreshes from upstream only when the cached data is stale (TTL).
 * - Returns the latest MAX_ARTICLES_PER_FEED articles ordered by publication date.
 *
 * @throws {FeedSourceNotFoundError} if userId doesn't own the feed.
 * @throws on DB or upstream network errors.
 */
export async function fetchAndCacheFeedArticles(
  db: ReturnType<typeof getDb>,
  userId: number,
  feedUrl: string,
): Promise<ArticleRow[]> {
  // 1. Verify ownership
  const [userSource] = await db
    .select({ id: feedSources.id })
    .from(feedSources)
    .where(and(eq(feedSources.userId, userId), eq(feedSources.url, feedUrl)))
    .limit(1);

  if (!userSource) {
    throw new FeedSourceNotFoundError(feedUrl);
  }

  // 2. Get or create the Feed record
  const [existingFeed] = await db
    .select({ id: feeds.id, url: feeds.url, lastFetched: feeds.lastFetched })
    .from(feeds)
    .where(eq(feeds.url, feedUrl))
    .limit(1);

  let currentFeed = existingFeed as typeof existingFeed | undefined;
  let shouldFetch = true;

  if (currentFeed) {
    const diffMinutes =
      (Date.now() - new Date(currentFeed.lastFetched).getTime()) / 60_000;
    if (diffMinutes < CONFIG.FEED_CACHE_TTL_MINUTES) shouldFetch = false;
  } else {
    const [createdFeed] = await db
      .insert(feeds)
      .values({ url: feedUrl })
      .onConflictDoNothing({ target: feeds.url })
      .returning({
        id: feeds.id,
        url: feeds.url,
        lastFetched: feeds.lastFetched,
      });

    if (createdFeed) {
      currentFeed = createdFeed;
    } else {
      // Another request inserted it concurrently — re-fetch.
      const [persistedFeed] = await db
        .select({
          id: feeds.id,
          url: feeds.url,
          lastFetched: feeds.lastFetched,
        })
        .from(feeds)
        .where(eq(feeds.url, feedUrl))
        .limit(1);
      currentFeed = persistedFeed;
    }
  }

  if (!currentFeed) throw new Error("Unable to resolve feed record");

  // 3. Fetch upstream if stale
  if (shouldFetch) {
    const feedResponse = await axios.get(feedUrl, {
      timeout: CONFIG.FEED_REQUEST_TIMEOUT_MS,
      maxContentLength: CONFIG.MAX_FEED_RESPONSE_SIZE_BYTES,
      maxRedirects: 3,
      beforeRedirect: (options) => {
        const protocol = options.protocol?.toLowerCase() ?? "";
        const hostname = normalizeHostname(options.hostname ?? "");
        if (
          (protocol !== "http:" && protocol !== "https:") ||
          isBlockedHost(hostname)
        ) {
          throw new Error("Blocked redirect target");
        }
      },
    });

    const feedResponseParsed = await parser.parseString(feedResponse.data);
    const now = new Date();
    const feedId = currentFeed.id;

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
          publicationDate: parseFeedItemDate(item.isoDate ?? item.pubDate, now),
          content: sanitizeArticleContent(
            sanitizeRssHtml(item.content || item.contentSnippet || ""),
          ),
          feedId,
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
      .where(eq(feeds.url, feedUrl));
  }

  // 4. Return the cached articles (limited to avoid huge payloads)
  return db
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
    .orderBy(desc(articles.publicationDate))
    .limit(MAX_ARTICLES_PER_FEED);
}
