/**
 * Upstream RSS feed fetching and DB article upsert.
 * Fetches feed XML with SSRF-safe URL validation,
 * RSS parsing, content sanitization, and deduplication.
 */

import { eq, sql } from "drizzle-orm";
import Parser from "rss-parser";

import { fetchFeedXml } from "./feed-http";
import {
  dedupePendingArticles,
  getPublicationDateRange,
  type PendingArticle,
  toPendingArticle,
} from "./feed-parser";

import { CONFIG } from "@/lib/config";
import type { getDb } from "@/lib/db/db";
import { articles, feeds } from "@/lib/db/schema";
import { logger } from "@/lib/logger";
import { toErrorMessage } from "@/lib/utils/errors";

// ─── Diagnostic logging helpers ───────────────────────────────────────────────
export const diagInfo = (msg: string, ctx?: Record<string, unknown>) => {
  if (CONFIG.FEED_REFRESH_DIAGNOSTICS_ENABLED) logger.info(msg, ctx);
};
export const diagWarn = (msg: string, ctx?: Record<string, unknown>) => {
  if (CONFIG.FEED_REFRESH_DIAGNOSTICS_ENABLED) logger.warn(msg, ctx);
};

// ─── RSS parser singleton ─────────────────────────────────────────────────────
// parseString() creates a fresh readable stream per call — no shared state.
// Configure to parse content:encoded (used by many feeds for full article content)
const parser = new Parser({
  customFields: {
    item: [["content:encoded", "contentEncoded", { keepArray: false }]],
  },
});

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FeedRecord {
  id: number;
  lastFetched: Date;
  lastFetchError: null | string;
  url: string;
}

// ─── Upstream refresh ─────────────────────────────────────────────────────────

export type UpstreamRefreshResult = { error: string; ok: false } | { ok: true };

interface RefreshDeps {
  dedupePendingArticlesFn?: typeof dedupePendingArticles;
  fetchFeedXmlFn?: (url: string) => Promise<string>;
  getPublicationDateRangeFn?: typeof getPublicationDateRange;
  nowFn?: () => Date;
  parseFeedXmlFn?: (
    xml: string,
  ) => Promise<{ items: (Parser.Item & { contentEncoded?: string })[] }>;
  toErrorMessageFn?: typeof toErrorMessage;
  toPendingArticleFn?: typeof toPendingArticle;
}

export async function refreshFeedFromUpstream(
  db: ReturnType<typeof getDb>,
  feed: FeedRecord,
  deps?: RefreshDeps,
): Promise<UpstreamRefreshResult> {
  const now = deps?.nowFn?.() ?? new Date();

  try {
    diagInfo("Upstream refresh started", {
      feedId: feed.id,
      lastFetched: feed.lastFetched,
      url: feed.url,
    });

    const fetchXml = deps?.fetchFeedXmlFn ?? fetchFeedXml;
    const parseFeedXml =
      deps?.parseFeedXmlFn ?? ((xml: string) => parser.parseString(xml));
    const toPending = deps?.toPendingArticleFn ?? toPendingArticle;
    const dedupe = deps?.dedupePendingArticlesFn ?? dedupePendingArticles;
    const getRange = deps?.getPublicationDateRangeFn ?? getPublicationDateRange;

    const feedXml = await fetchXml(feed.url);
    const parsed = await parseFeedXml(feedXml);
    const parsedItems = Array.isArray(parsed.items) ? parsed.items : [];

    const mappedItems = parsedItems
      .map((item) => toPending(item, feed.id, now))
      .filter((item): item is PendingArticle => item !== null);
    const validItems = dedupe(mappedItems);
    const publicationDateRange = getRange(validItems);

    diagInfo("Upstream refresh parsed feed", {
      acceptedItemCount: validItems.length,
      feedId: feed.id,
      newestPublicationDate: publicationDateRange.newestPublicationDate,
      oldestPublicationDate: publicationDateRange.oldestPublicationDate,
      parsedItemCount: parsedItems.length,
      url: feed.url,
    });

    if (validItems.length > 0) {
      await db
        .insert(articles)
        .values(validItems)
        .onConflictDoUpdate({
          set: {
            content: sql`excluded.content`,
            lastChecked: sql`excluded.last_checked`,
            publicationDate: sql`excluded.publication_date`,
            title: sql`excluded.title`,
          },
          target: articles.link,
        });

      diagInfo("Upstream refresh upserted articles", {
        feedId: feed.id,
        upsertAttemptCount: validItems.length,
        url: feed.url,
      });
    } else {
      diagInfo("Upstream refresh found no valid new items", {
        feedId: feed.id,
        url: feed.url,
      });
    }

    await db
      .update(feeds)
      .set({ lastFetched: now, lastFetchError: null })
      .where(eq(feeds.id, feed.id));

    diagInfo("Upstream refresh completed", {
      feedId: feed.id,
      newLastFetched: now,
      url: feed.url,
    });

    return { ok: true };
  } catch (err) {
    const toError = deps?.toErrorMessageFn ?? toErrorMessage;
    const errorMessage = toError(err);

    diagWarn("Upstream feed refresh failed", {
      error: errorMessage,
      url: feed.url,
    });

    // Advance lastFetched even on failure so the TTL cooldown applies —
    // otherwise every request retries the upstream on a consistently-failing feed.
    try {
      await db
        .update(feeds)
        .set({ lastFetched: now, lastFetchError: errorMessage })
        .where(eq(feeds.id, feed.id));

      diagInfo("Upstream refresh failure cooldown applied", {
        feedId: feed.id,
        url: feed.url,
      });
    } catch {
      // Best-effort; ignore secondary DB errors.
    }

    return { error: errorMessage, ok: false };
  }
}

export function shouldForceRefreshFeed(lastFetched: Date): boolean {
  const ageMinutes = getAgeInMinutes(lastFetched);
  return ageMinutes >= CONFIG.FEED_FORCE_REFRESH_TTL_MINUTES;
}

export function shouldRefreshFeed(lastFetched: Date): boolean {
  const ageMinutes = getAgeInMinutes(lastFetched);
  return ageMinutes >= CONFIG.FEED_CACHE_TTL_MINUTES;
}

function getAgeInMinutes(date: Date): number {
  return (Date.now() - date.getTime()) / 60_000;
}
