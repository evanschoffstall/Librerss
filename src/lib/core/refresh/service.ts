/**
 * Upstream RSS feed fetching and DB article upsert.
 * Fetches feed XML with SSRF-safe URL validation,
 * RSS parsing, content sanitization, and deduplication.
 */

import { eq, sql } from "drizzle-orm";
import Parser from "rss-parser";

import { CONFIG, logger } from "@/lib";
import { type FeedUpstreamTransport, fetchFeedXml } from "@/lib/core/feed-http";
import {
  dedupePendingArticles,
  FEED_PARSER_CUSTOM_FIELDS,
  getPublicationDateRange,
  type ParsedFeedItem,
  type PendingArticle,
  toPendingArticle,
} from "./parser";

/**
 * Defines the DB mod type.
 */
type DbMod = typeof import("@/lib/db");

// ─── Diagnostic logging helpers ───────────────────────────────────────────────
/**
 * Emit a diagnostic info log when feed refresh diagnostics are enabled.
 * @param msg - The log message.
 * @param ctx - Optional structured context attached to the log entry.
 */
export const diagInfo = (msg: string, ctx?: Record<string, unknown>) => {
  if (CONFIG.FEED_REFRESH_DIAGNOSTICS_ENABLED) logger.info(msg, ctx);
};

/**
 * Emit a diagnostic warning log when feed refresh diagnostics are enabled.
 * @param msg - The log message.
 * @param ctx - Optional structured context attached to the log entry.
 */
export const diagWarn = (msg: string, ctx?: Record<string, unknown>) => {
  if (CONFIG.FEED_REFRESH_DIAGNOSTICS_ENABLED) logger.warn(msg, ctx);
};

const parser = new Parser({
  customFields: FEED_PARSER_CUSTOM_FIELDS,
});

const HTML_DOCUMENT_PREFIX_PATTERN = /^\s*(?:<!doctype\s+html\b|<html\b)/iu;
const HTML_INSTEAD_OF_FEED_XML_ERROR_MESSAGE =
  "Upstream returned HTML instead of RSS or Atom feed XML";

/**
 * Describes the feed record.
 */
export interface FeedRecord {
  id: number;
  lastFetched: Date;
  lastFetchError: null | string;
  proxyEnabled?: boolean;
  url: string;
}

/**
 * Describes the upstream refresh result.
 */
export type UpstreamRefreshResult =
  | { error: RefreshBatchFeedError; ok: false }
  | { ok: true };

/**
 * Describes the parsed refresh items.
 */
interface ParsedRefreshItems {
  parsedItems: ParsedFeedItem[];
  publicationDateRange: ReturnType<typeof getPublicationDateRange>;
  validItems: PendingArticle[];
}

/**
 * Describes the refresh deps.
 */
interface RefreshDeps {
  dedupePendingArticlesFn?: typeof dedupePendingArticles;
  fetchFeedXmlFn?: (
    url: string,
    transport?: FeedUpstreamTransport,
  ) => Promise<string>;
  getPublicationDateRangeFn?: typeof getPublicationDateRange;
  nowFn?: () => Date;
  parseFeedXmlFn?: (xml: string) => Promise<{ items: ParsedFeedItem[] }>;
  proxyTransport?: FeedUpstreamTransport;
  toErrorMessageFn?: typeof toErrorMessage;
  toPendingArticleFn?: typeof toPendingArticle;
}

/**
 * Describes the resolved refresh deps.
 */
interface ResolvedRefreshDeps {
  dedupePendingArticlesFn: typeof dedupePendingArticles;
  fetchFeedXmlFn: (
    url: string,
    transport?: FeedUpstreamTransport,
  ) => Promise<string>;
  getPublicationDateRangeFn: typeof getPublicationDateRange;
  parseFeedXmlFn: (xml: string) => Promise<{ items: ParsedFeedItem[] }>;
  toErrorMessageFn: typeof toErrorMessage;
  toPendingArticleFn: typeof toPendingArticle;
}

/**
 * Process the refresh feed from upstream.
 * @param db - The db.
 * @param feed - The feed.
 * @param deps - The deps.
 * @returns The refresh feed from upstream.
 */
export async function refreshFeedFromUpstream(
  db: ReturnType<DbMod["getDb"]>,
  feed: FeedRecord,
  deps?: RefreshDeps,
): Promise<UpstreamRefreshResult> {
  const now = deps?.nowFn?.() ?? new Date();
  const refreshDeps = resolveRefreshDeps(deps);
  const proxyTransport =
    feed.proxyEnabled === true ? deps?.proxyTransport : undefined;
  const connectionMode = proxyTransport?.proxyUrl ? "proxy" : "direct";

  try {
    logRefreshStart(feed, proxyTransport, connectionMode);
    const { parsedItems, publicationDateRange, validItems } =
      await parseRefreshItems(feed, now, proxyTransport, refreshDeps);

    logParsedRefreshResult(feed, parsedItems, publicationDateRange, validItems);
    await persistSuccessfulRefresh(db, feed, now, validItems);
    logRefreshComplete(feed, now);

    return { ok: true };
  } catch (err) {
    const errorMessage = refreshDeps.toErrorMessageFn(err);
    const errorDetails: RefreshBatchFeedError =
      err instanceof HttpCloakUpstreamError
        ? { message: errorMessage, statusCode: err.statusCode }
        : { message: errorMessage };

    diagWarn("Upstream feed refresh failed", {
      error: errorMessage,
      url: feed.url,
    });

    await applyRefreshFailureCooldown(db, feed, now, errorMessage);
    return { error: errorDetails, ok: false };
  }
}

/**
 * Return whether should force refresh feed.
 * @param lastFetched - The last fetched.
 * @returns Whether should force refresh feed.
 */
export function shouldForceRefreshFeed(lastFetched: Date): boolean {
  const ageMinutes = getAgeInMinutes(lastFetched);
  return ageMinutes >= CONFIG.FEED_FORCE_REFRESH_TTL_MINUTES;
}

/**
 * Return whether should refresh feed.
 * @param lastFetched - The last fetched.
 * @returns Whether should refresh feed.
 */
export function shouldRefreshFeed(lastFetched: Date): boolean {
  const ageMinutes = getAgeInMinutes(lastFetched);
  return ageMinutes >= CONFIG.FEED_CACHE_TTL_MINUTES;
}

/**
 * Process the apply refresh failure cooldown.
 * @param db - The db.
 * @param feed - The feed.
 * @param now - The now.
 * @param errorMessage - The error message.
 */
async function applyRefreshFailureCooldown(
  db: ReturnType<DbMod["getDb"]>,
  feed: FeedRecord,
  now: Date,
  errorMessage: string,
): Promise<void> {
  try {
    const { feeds } = await import("@/lib/db");
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
}

/**
 * Return the age in minutes.
 * @param date - The date.
 * @returns The age in minutes.
 */
function getAgeInMinutes(date: Date): number {
  return (Date.now() - date.getTime()) / 60_000;
}

/**
 * Process the log parsed refresh result.
 * @param feed - The feed.
 * @param parsedItems - The parsed items.
 * @param publicationDateRange - The publication date range.
 * @param validItems - The valid items.
 */
function logParsedRefreshResult(
  feed: FeedRecord,
  parsedItems: ParsedFeedItem[],
  publicationDateRange: ReturnType<typeof getPublicationDateRange>,
  validItems: PendingArticle[],
): void {
  diagInfo("Upstream refresh parsed feed", {
    acceptedItemCount: validItems.length,
    feedId: feed.id,
    newestPublicationDate: publicationDateRange.newestPublicationDate,
    oldestPublicationDate: publicationDateRange.oldestPublicationDate,
    parsedItemCount: parsedItems.length,
    url: feed.url,
  });
}

/**
 * Process the log refresh complete.
 * @param feed - The feed.
 * @param now - The now.
 */
function logRefreshComplete(feed: FeedRecord, now: Date): void {
  diagInfo("Upstream refresh completed", {
    feedId: feed.id,
    newLastFetched: now,
    url: feed.url,
  });
}

/**
 * Process the log refresh start.
 * @param feed - The feed.
 * @param proxyTransport - The proxy transport.
 * @param connectionMode - The connection mode.
 */
function logRefreshStart(
  feed: FeedRecord,
  proxyTransport: FeedUpstreamTransport | undefined,
  connectionMode: "direct" | "proxy",
): void {
  diagInfo("Upstream refresh started", {
    connectionMode,
    feedId: feed.id,
    lastFetched: feed.lastFetched,
    proxyEndpoint: proxyTransport?.proxyUrl
      ? redactUrlForLogs(proxyTransport.proxyUrl)
      : null,
    url: feed.url,
  });
}

/**
 * Parse upstream feed XML while normalizing obvious HTML-document responses to
 * a stable feed-content error.
 * @param xml - Upstream payload returned for the configured feed URL.
 * @returns The parsed feed items produced by rss-parser.
 */
async function parseFeedXml(xml: string): Promise<{ items: ParsedFeedItem[] }> {
  if (isHtmlDocumentResponse(xml)) {
    throw createHtmlInsteadOfFeedXmlError();
  }

  return parser.parseString(xml);
}

/**
 * Parse the refresh items.
 * @param feed - The feed.
 * @param now - The now.
 * @param proxyTransport - The proxy transport.
 * @param deps - The deps.
 * @returns The refresh items.
 */
async function parseRefreshItems(
  feed: FeedRecord,
  now: Date,
  proxyTransport: FeedUpstreamTransport | undefined,
  deps: ResolvedRefreshDeps,
): Promise<ParsedRefreshItems> {
  const feedXml = await deps.fetchFeedXmlFn(feed.url, proxyTransport);
  const parsed = await deps.parseFeedXmlFn(feedXml);
  const parsedItems = Array.isArray(parsed.items) ? parsed.items : [];
  const mappedItems = parsedItems
    .map((item) => deps.toPendingArticleFn(item, feed.id, now))
    .filter((item): item is PendingArticle => item !== null);
  const validItems = deps.dedupePendingArticlesFn(mappedItems);

  return {
    parsedItems,
    publicationDateRange: deps.getPublicationDateRangeFn(validItems),
    validItems,
  };
}

/**
 * Process the persist successful refresh.
 * @param db - The db.
 * @param feed - The feed.
 * @param now - The now.
 * @param validItems - The valid items.
 */
async function persistSuccessfulRefresh(
  db: ReturnType<DbMod["getDb"]>,
  feed: FeedRecord,
  now: Date,
  validItems: PendingArticle[],
): Promise<void> {
  const { articles, feeds } = await import("@/lib/db");

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
        where: sql`${articles.title} IS DISTINCT FROM excluded.title OR ${articles.content} IS DISTINCT FROM excluded.content OR ${articles.publicationDate} IS DISTINCT FROM excluded.publication_date`,
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
}

/**
 * Resolve the refresh deps.
 * @param deps - The deps.
 * @returns The refresh deps.
 */
function resolveRefreshDeps(
  deps: RefreshDeps | undefined,
): ResolvedRefreshDeps {
  return {
    dedupePendingArticlesFn:
      deps?.dedupePendingArticlesFn ?? dedupePendingArticles,
    fetchFeedXmlFn:
      deps?.fetchFeedXmlFn ??
      ((url: string, transport?: FeedUpstreamTransport) =>
        fetchFeedXml(url, undefined, transport)),
    getPublicationDateRangeFn:
      deps?.getPublicationDateRangeFn ?? getPublicationDateRange,
    parseFeedXmlFn: deps?.parseFeedXmlFn ?? parseFeedXml,
    toErrorMessageFn: deps?.toErrorMessageFn ?? toErrorMessage,
    toPendingArticleFn: deps?.toPendingArticleFn ?? toPendingArticle,
  };
}
