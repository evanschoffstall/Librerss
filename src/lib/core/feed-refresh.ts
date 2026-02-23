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

const DIAG = CONFIG.FEED_REFRESH_DIAGNOSTICS_ENABLED;

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

export function shouldRefreshFeed(lastFetched: Date): boolean {
  const ageMinutes = (Date.now() - new Date(lastFetched).getTime()) / 60_000;
  return ageMinutes >= CONFIG.FEED_CACHE_TTL_MINUTES;
}

export function shouldForceRefreshFeed(lastFetched: Date): boolean {
  const ageMinutes = (Date.now() - new Date(lastFetched).getTime()) / 60_000;
  return ageMinutes >= CONFIG.FEED_FORCE_REFRESH_TTL_MINUTES;
}

export type UpstreamRefreshResult = { ok: true } | { ok: false; error: string };

export async function refreshFeedFromUpstream(
  db: ReturnType<typeof getDb>,
  feed: FeedRecord,
): Promise<UpstreamRefreshResult> {
  try {
    if (DIAG) {
      logger.info("Upstream refresh started", {
        feedId: feed.id,
        url: feed.url,
        lastFetched: feed.lastFetched,
      });
    }

    const feedXml = await fetchFeedXml(feed.url);
    const parsed = await parser.parseString(feedXml);
    const now = new Date();

    const mappedItems = parsed.items
      .map((item) => toPendingArticle(item, feed.id, now))
      .filter((item): item is PendingArticle => item !== null);
    const validItems = dedupePendingArticles(mappedItems);
    const publicationDateRange = getPublicationDateRange(validItems);

    if (DIAG) {
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

      if (DIAG) {
        logger.info("Upstream refresh upserted articles", {
          feedId: feed.id,
          url: feed.url,
          upsertAttemptCount: validItems.length,
        });
      }
    } else {
      if (DIAG) {
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

    if (DIAG) {
      logger.info("Upstream refresh completed", {
        feedId: feed.id,
        url: feed.url,
        newLastFetched: now,
      });
    }

    return { ok: true };
  } catch (err) {
    const errorMessage = toErrorMessage(err);

    if (DIAG) {
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

      if (DIAG) {
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
