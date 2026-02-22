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
  sanitizeAndTruncateArticleContent,
  sanitizeArticleTitle,
} from "@/lib/utils/sanitize";
import {
  isBlockedHost,
  isBlockedResolvedAddress,
  normalizeHostname,
} from "@/lib/utils/ssrf";
import { isValidUrl } from "@/lib/utils/url";
import axios from "axios";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import Parser from "rss-parser";

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
    if (DNS_CACHE.size >= DNS_CACHE_MAX_ENTRIES) {
      // Evict the oldest 20 % of entries (Map preserves insertion order) so
      // we avoid a full flush that causes a thundering-herd of DNS lookups.
      const evictCount = Math.ceil(DNS_CACHE_MAX_ENTRIES * 0.2);
      let evicted = 0;
      for (const k of DNS_CACHE.keys()) {
        DNS_CACHE.delete(k);
        if (++evicted >= evictCount) break;
      }
    }
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
    // Fail-closed: if we cannot resolve the hostname we cannot confirm it
    // resolves to a public address, so we treat it as blocked.  A transient
    // DNS hiccup is cached for only 60 s to avoid prolonged false-positives.
    setCacheSafe(hostname, {
      blocked: true,
      expiresAt: Date.now() + 60_000,
    });
    return true;
  }
}

// ─── URL validation ───────────────────────────────────────────────────────────

export async function isAllowedFeedUrl(raw: string): Promise<boolean> {
  try {
    // Reuse the same protocol + parse checks from isValidUrl so the two
    // cannot drift independently.
    if (!isValidUrl(raw)) return false;

    const parsed = new URL(raw);
    if (parsed.username || parsed.password) return false;

    const host = normalizeHostname(parsed.hostname);
    if (isBlockedHost(host)) return false;
    if (isIP(host)) return !isBlockedResolvedAddress(host);

    return !(await resolvesToBlockedAddress(host));
  } catch {
    return false;
  }
}

// ─── HTML sanitization ───────────────────────────────────────────────────────

// Sanitization options and the sanitizeAndTruncateArticleContent helper live
// in @/lib/utils/sanitize so every write path shares the same tag-allowlist.

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

    const itemDate = new Date(item.publicationDate).getTime();
    const currentDate = new Date(current.publicationDate).getTime();
    // Prefer the newer article; use content length only as a tiebreaker
    // for articles with identical publication timestamps so that a newer-but-
    // empty item never silently displaces a complete older article body.
    const shouldReplace =
      itemDate > currentDate ||
      (itemDate === currentDate &&
        item.content.length > current.content.length);

    if (shouldReplace)
      byLink.set(normalizedLink, { ...item, link: normalizedLink });
  }

  return [...byLink.values()];
}

// ─── RSS parser singleton ─────────────────────────────────────────────────────
// rss-parser's parseString() creates a fresh readable stream internally for
// each call and carries no mutable per-instance state between invocations,
// so the singleton is safe under concurrent requests.
const parser = new Parser();

type ArticleRow = {
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

// ─── Upstream RSS refresh (shared by single and batch paths) ──────────────────

type FeedRecord = { id: number; url: string; lastFetched: Date };

async function refreshFeedFromUpstream(
  db: ReturnType<typeof getDb>,
  feed: FeedRecord,
): Promise<void> {
  try {
    const feedResponse = await axios.get(feed.url, {
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
        // Best-effort: if the redirect target's hostname is already in the
        // DNS cache and was resolved as blocked, reject immediately.
        // Full async DNS re-validation of redirect targets would require
        // manual redirect handling; this provides defence-in-depth for
        // cached resolutions (e.g. a host blocked after initial validation).
        const cached = DNS_CACHE.get(hostname);
        if (cached && cached.expiresAt > Date.now() && cached.blocked) {
          throw new Error("Blocked redirect target (cached DNS)");
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
            isValidUrl(item.link ?? ""),
        )
        .map((item) => ({
          title: sanitizeArticleTitle(item.title),
          link: item.link!,
          publicationDate: parseFeedItemDate(item.isoDate ?? item.pubDate, now),
          content: sanitizeAndTruncateArticleContent(
            item.content || item.contentSnippet || "",
          ),
          feedId: feed.id,
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
      .where(eq(feeds.id, feed.id));
  } catch (err) {
    // Log and swallow so a single bad feed never blocks the whole batch.
    logger.warn("Upstream feed refresh failed", {
      url: feed.url,
      error: err instanceof Error ? err.message : String(err),
    });

    // Still advance lastFetched so the TTL cooldown applies to failed feeds
    // too — otherwise every request retries the upstream immediately and
    // hammers a consistently-failing endpoint on every page load.
    try {
      await db
        .update(feeds)
        .set({ lastFetched: new Date() })
        .where(eq(feeds.url, feed.url));
    } catch {
      // Best-effort; ignore secondary DB errors.
    }
  }
}

// ─── Ensure a Feed row exists for a URL, returning it ────────────────────────

async function ensureFeedRecord(
  db: ReturnType<typeof getDb>,
  feedUrl: string,
): Promise<FeedRecord> {
  const [existing] = await db
    .select({ id: feeds.id, url: feeds.url, lastFetched: feeds.lastFetched })
    .from(feeds)
    .where(eq(feeds.url, feedUrl))
    .limit(1);

  if (existing) return existing;

  const [created] = await db
    .insert(feeds)
    .values({ url: feedUrl })
    .onConflictDoNothing({ target: feeds.url })
    .returning({
      id: feeds.id,
      url: feeds.url,
      lastFetched: feeds.lastFetched,
    });

  if (created) return created;

  // Concurrent insert — just re-select.
  const [persisted] = await db
    .select({ id: feeds.id, url: feeds.url, lastFetched: feeds.lastFetched })
    .from(feeds)
    .where(eq(feeds.url, feedUrl))
    .limit(1);

  if (!persisted) throw new Error("Unable to resolve feed record");
  return persisted;
}

// ─── Batch: N feeds → ~3 DB round-trips total ────────────────────────────────

/**
 * Fetches and caches articles for multiple feed URLs in one shot.
 *
 * DB access pattern (regardless of N):
 *   1. One SELECT to verify ownership of all URLs.
 *   2. One SELECT to load all Feed records + lastFetched timestamps.
 *   3. If any Feed records are missing: one INSERT + one SELECT to resolve them.
 *   4. All stale upstream HTTP refreshes run in parallel (Promise.allSettled).
 *   5. One window-function SELECT to retrieve top-N articles per feed.
 *
 * Returns a Map<normalizedUrl, ArticleRow[]>.
 * URLs not owned by the user are silently omitted.
 */
export async function fetchAndCacheFeedArticlesBatch(
  db: ReturnType<typeof getDb>,
  userId: number,
  feedUrls: string[],
  { skipRefresh = false }: { skipRefresh?: boolean } = {},
): Promise<Map<string, ArticleRow[]>> {
  if (feedUrls.length === 0) return new Map();

  // ── 1. Ownership check (1 query) ──────────────────────────────────────────
  const ownedRows = await db
    .select({ url: feedSources.url })
    .from(feedSources)
    .where(
      and(eq(feedSources.userId, userId), inArray(feedSources.url, feedUrls)),
    );

  const ownedUrlSet = new Set(ownedRows.map((r) => r.url));
  const allowedUrls = feedUrls.filter((u) => ownedUrlSet.has(u));
  if (allowedUrls.length === 0) return new Map();

  // ── 2. Load all Feed records (1 query) ────────────────────────────────────
  const existingFeeds = await db
    .select({ id: feeds.id, url: feeds.url, lastFetched: feeds.lastFetched })
    .from(feeds)
    .where(inArray(feeds.url, allowedUrls));

  const feedByUrl = new Map<string, FeedRecord>(
    existingFeeds.map((f) => [f.url, f]),
  );

  // ── 3. Create any missing Feed records ───────────────────────────────────
  const missingUrls = allowedUrls.filter((u) => !feedByUrl.has(u));
  if (missingUrls.length > 0) {
    // Insert all at once; ignore conflicts from concurrent requests.
    await db
      .insert(feeds)
      .values(missingUrls.map((url) => ({ url })))
      .onConflictDoNothing({ target: feeds.url });

    const resolvedFeeds = await db
      .select({ id: feeds.id, url: feeds.url, lastFetched: feeds.lastFetched })
      .from(feeds)
      .where(inArray(feeds.url, missingUrls));

    for (const f of resolvedFeeds) feedByUrl.set(f.url, f);
  }

  // ── 4. Refresh stale feeds in parallel ───────────────────────────────────
  // Skip when the caller only wants cached articles (e.g. fast initial render).
  if (!skipRefresh) {
    const staleFeeds = allowedUrls
      .map((u) => feedByUrl.get(u))
      .filter((f): f is FeedRecord => {
        if (!f) return false;
        const ageMinutes =
          (Date.now() - new Date(f.lastFetched).getTime()) / 60_000;
        return ageMinutes >= CONFIG.FEED_CACHE_TTL_MINUTES;
      });

    // Fire all upstream fetches concurrently; failures are swallowed per-feed.
    if (staleFeeds.length > 0) {
      await Promise.allSettled(
        staleFeeds.map((feed) => refreshFeedFromUpstream(db, feed)),
      );
    }
  }

  // ── 5. Read articles for all feeds (1 window-function query) ──────────────
  const feedIds = allowedUrls
    .map((u) => feedByUrl.get(u)?.id)
    .filter((id): id is number => id !== undefined);

  if (feedIds.length === 0) return new Map(allowedUrls.map((u) => [u, []]));

  // Use a ROW_NUMBER() window to get top-N per feed in a single roundtrip.
  type RankedRow = {
    id: unknown;
    title: unknown;
    link: unknown;
    content: unknown;
    publicationDate: unknown;
    feedId: unknown;
    lastChecked: unknown;
  };
  const queryResult = await db.execute<RankedRow>(sql`
    SELECT id, title, link, content,
           publication_date AS "publicationDate",
           feed_id          AS "feedId",
           last_checked     AS "lastChecked"
    FROM (
      SELECT id, title, link, content, publication_date, feed_id, last_checked,
             ROW_NUMBER() OVER (
               PARTITION BY feed_id ORDER BY publication_date DESC
             ) AS rn
      FROM "Article"
      WHERE feed_id IN (${sql.join(
        feedIds.map((id) => sql`${id}`),
        sql`, `,
      )})
    ) ranked
    WHERE rn <= ${CONFIG.MAX_ARTICLES_PER_FEED}
    ORDER BY publication_date DESC
  `);

  const rows: RankedRow[] = Array.isArray(queryResult)
    ? queryResult
    : (queryResult as { rows: RankedRow[] }).rows;

  // Group results by URL.
  const idToUrl = new Map<number, string>(
    allowedUrls
      .map((u): [number, string] | null => {
        const id = feedByUrl.get(u)?.id;
        return id !== undefined ? [id, u] : null;
      })
      .filter((e): e is [number, string] => e !== null),
  );

  const result = new Map<string, ArticleRow[]>(allowedUrls.map((u) => [u, []]));

  for (const row of rows) {
    const url = idToUrl.get(Number(row.feedId));
    if (!url) continue;
    result.get(url)!.push({
      id: Number(row.id),
      title: String(row.title),
      link: String(row.link),
      content: String(row.content),
      publicationDate: new Date(row.publicationDate as string | Date),
      feedId: Number(row.feedId),
      lastChecked: new Date(row.lastChecked as string | Date),
    });
  }

  return result;
}

// ─── Single-feed wrapper (used by /api/feeds?url=…) ──────────────────────────

/**
 * Fetches and caches articles for one feed URL.
 *
 * @throws {FeedSourceNotFoundError} if userId doesn't own the feed.
 */
export async function fetchAndCacheFeedArticles(
  db: ReturnType<typeof getDb>,
  userId: number,
  feedUrl: string,
): Promise<ArticleRow[]> {
  // Fast path: verify ownership and get-or-create Feed record with minimal
  // queries, then refresh if stale, then select articles.
  const [userSource] = await db
    .select({ id: feedSources.id })
    .from(feedSources)
    .where(and(eq(feedSources.userId, userId), eq(feedSources.url, feedUrl)))
    .limit(1);

  if (!userSource) throw new FeedSourceNotFoundError(feedUrl);

  const feed = await ensureFeedRecord(db, feedUrl);

  const ageMinutes =
    (Date.now() - new Date(feed.lastFetched).getTime()) / 60_000;
  if (ageMinutes >= CONFIG.FEED_CACHE_TTL_MINUTES) {
    await refreshFeedFromUpstream(db, feed);
  }

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
    .where(eq(articles.feedId, feed.id))
    .orderBy(desc(articles.publicationDate))
    .limit(CONFIG.MAX_ARTICLES_PER_FEED);
}
