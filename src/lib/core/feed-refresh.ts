/**
 * Upstream RSS feed fetching and DB article upsert.
 * Handles redirect-following (with SSRF re-validation on each hop),
 * RSS parsing, content sanitization, and deduplication.
 */

import { CONFIG } from "@/lib/config";
import type { getDb } from "@/lib/db/db";
import { articles, feeds } from "@/lib/db/schema";
import { toErrorMessage } from "@/lib/utils/errors";
import { logger } from "@/lib/utils/logger";
import {
  sanitizeAndTruncateArticleContent,
  sanitizeArticleTitle,
} from "@/lib/utils/sanitize";
import { isValidUrl } from "@/lib/utils/url";
import axios from "axios";
import { eq, sql } from "drizzle-orm";
import Parser from "rss-parser";
import { assertPublicFeedUrl } from "./feed-url-validator";

// ─── RSS parser singleton ─────────────────────────────────────────────────────
// parseString() creates a fresh readable stream per call — no shared state.
const parser = new Parser();

// ─── Types ────────────────────────────────────────────────────────────────────

type PendingArticle = {
  title: string;
  link: string;
  publicationDate: Date;
  content: string;
  feedId: number;
  lastChecked: Date;
};

export type FeedRecord = { id: number; url: string; lastFetched: Date };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseFeedItemDate(value: string | undefined, fallback: Date): Date {
  if (!value) return fallback;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}

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
    // Prefer newer; use content length as tiebreaker for identical timestamps
    // so a newer-but-empty item never displaces a complete article body.
    const shouldReplace =
      itemDate > currentDate ||
      (itemDate === currentDate && item.content.length > current.content.length);

    if (shouldReplace) byLink.set(normalizedLink, { ...item, link: normalizedLink });
  }

  return [...byLink.values()];
}

function toPendingArticle(
  item: Parser.Item,
  feedId: number,
  now: Date,
): PendingArticle | null {
  if (!item.title || !item.link || !isValidUrl(item.link)) return null;

  return {
    title: sanitizeArticleTitle(item.title),
    link: item.link,
    publicationDate: parseFeedItemDate(item.isoDate ?? item.pubDate, now),
    content: sanitizeAndTruncateArticleContent(item.content || item.contentSnippet || ""),
    feedId,
    lastChecked: now,
  };
}

// ─── Fetch with redirect validation ──────────────────────────────────────────

export async function fetchFeedXmlWithValidatedRedirects(
  initialUrl: string,
): Promise<string> {
  let currentUrl = initialUrl;

  for (let redirects = 0; redirects <= 3; redirects += 1) {
    await assertPublicFeedUrl(currentUrl);

    const response = await axios.get(currentUrl, {
      timeout: CONFIG.FEED_REQUEST_TIMEOUT_MS,
      maxContentLength: CONFIG.MAX_FEED_RESPONSE_SIZE_BYTES,
      maxRedirects: 0,
      responseType: "text",
      validateStatus: (status) => status >= 200 && status < 400,
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.location;
      if (typeof location !== "string" || !location.trim()) {
        throw new Error("Redirect without Location header");
      }
      currentUrl = new URL(location, currentUrl).toString();
      continue;
    }

    return typeof response.data === "string"
      ? response.data
      : String(response.data ?? "");
  }

  throw new Error("Too many redirects");
}

// ─── Upstream refresh ─────────────────────────────────────────────────────────

export function shouldRefreshFeed(lastFetched: Date): boolean {
  const ageMinutes = (Date.now() - new Date(lastFetched).getTime()) / 60_000;
  return ageMinutes >= CONFIG.FEED_CACHE_TTL_MINUTES;
}

export async function refreshFeedFromUpstream(
  db: ReturnType<typeof getDb>,
  feed: FeedRecord,
): Promise<void> {
  try {
    const feedXml = await fetchFeedXmlWithValidatedRedirects(feed.url);
    const parsed = await parser.parseString(feedXml);
    const now = new Date();

    const mappedItems = parsed.items
      .map((item) => toPendingArticle(item, feed.id, now))
      .filter((item): item is PendingArticle => item !== null);
    const validItems = dedupePendingArticles(mappedItems);

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

    await db.update(feeds).set({ lastFetched: now }).where(eq(feeds.id, feed.id));
  } catch (err) {
    logger.warn("Upstream feed refresh failed", {
      url: feed.url,
      error: toErrorMessage(err),
    });

    // Advance lastFetched even on failure so the TTL cooldown applies —
    // otherwise every request retries the upstream on a consistently-failing feed.
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
