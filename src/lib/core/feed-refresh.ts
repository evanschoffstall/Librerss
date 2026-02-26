/**
 * Upstream RSS feed fetching and DB article upsert.
 * Fetches feed XML with SSRF-safe URL validation,
 * RSS parsing, content sanitization, and deduplication.
 */

import { CONFIG } from "@/lib/config";
import type { getDb } from "@/lib/db/db";
import { articles, feeds } from "@/lib/db/schema";
import { toErrorMessage } from "@/lib/utils/errors";
import { logger } from "@/lib/utils/logger";
import { eq, sql } from "drizzle-orm";
import Parser from "rss-parser";
import { fetchFeedXml } from "./feed-http";
import {
  type PendingArticle,
  dedupePendingArticles,
  getPublicationDateRange,
  toPendingArticle,
} from "./feed-parser";

// ─── RSS parser singleton ─────────────────────────────────────────────────────
// parseString() creates a fresh readable stream per call — no shared state.
// Configure to parse content:encoded (used by many feeds for full article content)
const parser = new Parser({
  customFields: {
    item: [["content:encoded", "contentEncoded", { keepArray: false }]],
  },
});

// ─── Types ────────────────────────────────────────────────────────────────────

export type FeedRecord = {
  id: number;
  url: string;
  lastFetched: Date;
  lastFetchError: string | null;
};

// ─── Upstream refresh ─────────────────────────────────────────────────────────

function getAgeInMinutes(date: Date): number {
  return (Date.now() - date.getTime()) / 60_000;
}

export function shouldRefreshFeed(lastFetched: Date): boolean {
  const ageMinutes = getAgeInMinutes(lastFetched);
  return ageMinutes >= CONFIG.FEED_CACHE_TTL_MINUTES;
}

export function shouldForceRefreshFeed(lastFetched: Date): boolean {
  const ageMinutes = getAgeInMinutes(lastFetched);
  return ageMinutes >= CONFIG.FEED_FORCE_REFRESH_TTL_MINUTES;
}

export type UpstreamRefreshResult = { ok: true } | { ok: false; error: string };

type RefreshDeps = {
  fetchFeedXmlFn?: (url: string) => Promise<string>;
  parseFeedXmlFn?: (
    xml: string,
  ) => Promise<{ items: Array<Parser.Item & { contentEncoded?: string }> }>;
  toPendingArticleFn?: typeof toPendingArticle;
  dedupePendingArticlesFn?: typeof dedupePendingArticles;
  getPublicationDateRangeFn?: typeof getPublicationDateRange;
  toErrorMessageFn?: typeof toErrorMessage;
  nowFn?: () => Date;
};

export async function refreshFeedFromUpstream(
  db: ReturnType<typeof getDb>,
  feed: FeedRecord,
  deps?: RefreshDeps,
): Promise<UpstreamRefreshResult> {
  try {
    if (CONFIG.FEED_REFRESH_DIAGNOSTICS_ENABLED) {
      logger.info("Upstream refresh started", {
        feedId: feed.id,
        url: feed.url,
        lastFetched: feed.lastFetched,
      });
    }

    const fetchXml = deps?.fetchFeedXmlFn ?? fetchFeedXml;
    const parseFeedXml =
      deps?.parseFeedXmlFn ?? ((xml: string) => parser.parseString(xml));
    const toPending = deps?.toPendingArticleFn ?? toPendingArticle;
    const dedupe = deps?.dedupePendingArticlesFn ?? dedupePendingArticles;
    const getRange = deps?.getPublicationDateRangeFn ?? getPublicationDateRange;
    const now = deps?.nowFn?.() ?? new Date();

    const feedXml = await fetchXml(feed.url);
    const parsed = await parseFeedXml(feedXml);

    const mappedItems = parsed.items
      .map((item) => toPending(item, feed.id, now))
      .filter((item): item is PendingArticle => item !== null);
    const validItems = dedupe(mappedItems);
    const publicationDateRange = getRange(validItems);

    if (CONFIG.FEED_REFRESH_DIAGNOSTICS_ENABLED) {
      logger.info("Upstream refresh parsed feed", {
        feedId: feed.id,
        url: feed.url,
        parsedItemCount: parsed.items.length,
        acceptedItemCount: validItems.length,
        newestPublicationDate: publicationDateRange.newestPublicationDate,
        oldestPublicationDate: publicationDateRange.oldestPublicationDate,
      });
    }

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

      if (CONFIG.FEED_REFRESH_DIAGNOSTICS_ENABLED) {
        logger.info("Upstream refresh upserted articles", {
          feedId: feed.id,
          url: feed.url,
          upsertAttemptCount: validItems.length,
        });
      }
    } else {
      if (CONFIG.FEED_REFRESH_DIAGNOSTICS_ENABLED) {
        logger.info("Upstream refresh found no valid new items", {
          feedId: feed.id,
          url: feed.url,
        });
      }
    }

    await db
      .update(feeds)
      .set({ lastFetched: now, lastFetchError: null })
      .where(eq(feeds.id, feed.id));

    if (CONFIG.FEED_REFRESH_DIAGNOSTICS_ENABLED) {
      logger.info("Upstream refresh completed", {
        feedId: feed.id,
        url: feed.url,
        newLastFetched: now,
      });
    }

    return { ok: true };
  } catch (err) {
    const toError = deps?.toErrorMessageFn ?? toErrorMessage;
    const errorMessage = toError(err);

    if (CONFIG.FEED_REFRESH_DIAGNOSTICS_ENABLED) {
      logger.warn("Upstream feed refresh failed", {
        url: feed.url,
        error: errorMessage,
      });
    }

    // Advance lastFetched even on failure so the TTL cooldown applies —
    // otherwise every request retries the upstream on a consistently-failing feed.
    try {
      await db
        .update(feeds)
        .set({ lastFetched: new Date(), lastFetchError: errorMessage })
        .where(eq(feeds.url, feed.url));

      if (CONFIG.FEED_REFRESH_DIAGNOSTICS_ENABLED) {
        logger.info("Upstream refresh failure cooldown applied", {
          feedId: feed.id,
          url: feed.url,
        });
      }
    } catch {
      // Best-effort; ignore secondary DB errors.
    }

    return { ok: false, error: errorMessage };
  }
}
