import { and, eq, gt, lt } from "drizzle-orm";

import { logger } from "@/lib";
import { FEED_STREAM_PREFIX, parseUserLabel, STARRED_STATE } from "@/lib/core";

import { canUseArticleStatusesTable, upsertArticleStatuses } from "./status";

type DbInstance = ReturnType<DbMod["getDb"]>;
type DbMod = typeof import("@/lib/db");
type DbTables = Pick<
  DbMod,
  "articles" | "articleStatuses" | "feedCategories" | "feeds" | "feedSources"
>;

/**
 * Per-batch page size for cursor-based iteration over article IDs. Keeping
 * this at 500 aligns with the {@link upsertArticleStatuses} chunk size so
 * each SELECT page maps cleanly to one independent DB transaction, preserving
 * partial progress if a later batch fails or times out.
 */
const MARK_ALL_READ_BATCH_SIZE = 500;

/**
 * Absolute upper bound on total articles marked read per invocation. Guards
 * against runaway iteration on extremely large streams and aligns with the
 * default `MARK_ALL_READ_LIMIT` environment variable value.
 */
const MARK_ALL_READ_HARD_LIMIT = 10_000;

interface ArticleIdRow {
  articleId: number;
}

interface ArticleIdsForStreamOptions {
  /** Exclusive lower bound on article ID; used as the pagination cursor. */
  afterId: number;
  beforeDate: Date | undefined;
  db: DbInstance;
  enabledJoin: ReturnType<typeof and>;
  stream: string;
  tables: DbTables;
  useArticleStatuses: boolean;
  userId: number;
  userLabel: null | string;
}

/** Identifies the owner and name of a user-defined label stream. */
interface LabelStream {
  /** The ID of the user who owns the label. */
  userId: number;
  /** The label name (e.g. `"Technology"`). */
  userLabel: string;
}

interface MarkStreamAsReadDeps {
  beforeMs?: number;
  canUseArticleStatusesTableFn?: typeof canUseArticleStatusesTable;
  db?: DbInstance;
  upsertArticleStatusesFn?: typeof upsertArticleStatuses;
}

/**
 * Marks every article in the given stream as read for the specified user.
 *
 * Uses cursor-based pagination to iterate over article IDs in independent
 * {@link MARK_ALL_READ_BATCH_SIZE}-row batches. Each batch is committed in its
 * own DB transaction via {@link upsertArticleStatuses}, so partial progress is
 * preserved if a later batch fails or the connection is interrupted — mirroring
 * the durable bulk-mutation model used by large-scale mail systems.
 *
 * Iteration stops when:
 * - a batch returns fewer rows than {@link MARK_ALL_READ_BATCH_SIZE} (natural
 *   end-of-stream), or
 * - the cumulative processed count reaches {@link MARK_ALL_READ_HARD_LIMIT}
 *   (safety cap against runaway iteration on enormous streams).
 *
 * @param userId - The ID of the user whose read state should be updated.
 * @param stream - The Google Reader-style stream ID (feed, label, reading-list,
 *   starred, etc.) identifying which articles to mark as read.
 * @param deps - Optional dependency overrides; used in tests to inject mock DB
 *   instances, upsert functions, and table-availability checks.
 */
export async function markStreamAsRead(
  userId: number,
  stream: string,
  deps?: MarkStreamAsReadDeps,
): Promise<void> {
  const {
    articles,
    articleStatuses,
    feedCategories,
    feeds,
    feedSources,
    getDb: getDbFn,
  } = await import("@/lib/db");
  const tables = {
    articles,
    articleStatuses,
    feedCategories,
    feeds,
    feedSources,
  };
  const { beforeDate, canUseArticleStatuses, db, upsertStatuses } =
    resolveMarkStreamAsReadDeps(deps, getDbFn);
  const userLabel = parseUserLabel(stream);
  const useArticleStatuses = await canUseArticleStatuses();
  const enabledJoin = buildEnabledFeedJoin(userId, tables);

  // Cursor-based batching: each batch commits independently so partial
  // progress survives connection loss or upstream errors on later pages.
  let afterId = 0;
  let totalProcessed = 0;

  for (;;) {
    const rows = await resolveArticleIdsForStream({
      afterId,
      beforeDate,
      db,
      enabledJoin,
      stream,
      tables,
      useArticleStatuses,
      userId,
      userLabel,
    });

    if (rows.length === 0) break;

    await upsertStatuses(
      userId,
      rows.map((row) => row.articleId),
      { isRead: true },
    );

    afterId = rows[rows.length - 1]?.articleId ?? afterId;
    totalProcessed += rows.length;

    if (totalProcessed >= MARK_ALL_READ_HARD_LIMIT) {
      warnMarkAllReadHardLimit(stream);
      break;
    }

    if (rows.length < MARK_ALL_READ_BATCH_SIZE) break;
  }
}

/**
 * Builds the Drizzle `and()` condition used as the JOIN predicate when
 * restricting article queries to feeds that the given user has enabled.
 *
 * The predicate asserts:
 * - `feedSources.url = feeds.url` — ties the source record to its feed,
 * - `feedSources.userId = userId` — scopes to this user's subscriptions, and
 * - `feedSources.enabled = true` — excludes disabled/paused feeds.
 *
 * @param userId - The ID of the authenticated user.
 * @param tables - Drizzle table references required by the condition.
 * @returns A Drizzle `and()` expression suitable for use in `.innerJoin()`.
 */
function buildEnabledFeedJoin(userId: number, tables: DbTables) {
  return and(
    eq(tables.feedSources.url, tables.feeds.url),
    eq(tables.feedSources.userId, userId),
    eq(tables.feedSources.enabled, true),
  );
}

/**
 * Constructs the shared base query for all article-ID list helpers: selects
 * `{ articleId: articles.id }` and performs the two core JOINs needed to
 * restrict results to articles belonging to feeds that the user has enabled.
 *
 * Each stream-specific helper extends this base with additional JOINs, WHERE
 * predicates, an ORDER BY clause, and a LIMIT.
 *
 * @param db - Active database instance.
 * @param enabledJoin - Pre-built JOIN predicate from {@link buildEnabledFeedJoin}.
 * @param tables - Drizzle table references required by the query.
 * @returns A partially-built Drizzle query ready for `.where().orderBy().limit()`.
 */
function createBaseArticleIdQuery(
  db: DbInstance,
  enabledJoin: ReturnType<typeof and>,
  tables: DbTables,
) {
  return db
    .select({ articleId: tables.articles.id })
    .from(tables.articles)
    .innerJoin(tables.feeds, eq(tables.feeds.id, tables.articles.feedId))
    .innerJoin(tables.feedSources, enabledJoin);
}

/**
 * Queries article IDs for the default "reading-list" (all-feeds) stream,
 * applying an optional publication-date upper bound and an exclusive cursor on
 * `articles.id` for stable, offset-free pagination.
 *
 * @param db - Active database instance.
 * @param enabledJoin - Pre-built JOIN condition that restricts results to feeds
 *   enabled for the requesting user.
 * @param tables - Drizzle table references required by the query.
 * @param afterId - Exclusive lower bound on `articles.id`; use `0` for the
 *   first page.
 * @param beforeDate - Optional upper bound on `articles.publication_date`;
 *   omit to include all dates.
 * @returns A promise resolving to an ordered array of `{ articleId }` rows.
 */
function listAllStreamArticleIds(
  db: DbInstance,
  enabledJoin: ReturnType<typeof and>,
  tables: DbTables,
  afterId: number,
  beforeDate: Date | undefined,
) {
  return createBaseArticleIdQuery(db, enabledJoin, tables)
    .where(
      and(
        gt(tables.articles.id, afterId),
        beforeDate
          ? lt(tables.articles.publicationDate, beforeDate)
          : undefined,
      ),
    )
    .orderBy(tables.articles.id)
    .limit(MARK_ALL_READ_BATCH_SIZE);
}

/**
 * Queries article IDs for a single-feed stream, scoped to the given feed URL,
 * with an exclusive cursor on `articles.id` for stable pagination.
 *
 * @param db - Active database instance.
 * @param enabledJoin - Pre-built JOIN condition restricting results to feeds
 *   enabled for the requesting user.
 * @param tables - Drizzle table references required by the query.
 * @param feedUrl - The normalized feed URL identifying the stream to mark.
 * @param afterId - Exclusive lower bound on `articles.id`; use `0` for the
 *   first page.
 * @param beforeDate - Optional upper bound on `articles.publication_date`;
 *   omit to include all dates.
 * @returns A promise resolving to an ordered array of `{ articleId }` rows.
 */
function listFeedStreamArticleIds(
  db: DbInstance,
  enabledJoin: ReturnType<typeof and>,
  tables: DbTables,
  feedUrl: string,
  afterId: number,
  beforeDate: Date | undefined,
) {
  return createBaseArticleIdQuery(db, enabledJoin, tables)
    .where(
      and(
        eq(tables.feeds.url, feedUrl),
        gt(tables.articles.id, afterId),
        beforeDate
          ? lt(tables.articles.publicationDate, beforeDate)
          : undefined,
      ),
    )
    .orderBy(tables.articles.id)
    .limit(MARK_ALL_READ_BATCH_SIZE);
}

/**
 * Queries article IDs for a user-defined label stream, joining through
 * `feedCategories` to scope results to the given label, with an exclusive
 * cursor on `articles.id` for stable pagination.
 *
 * @param db - Active database instance.
 * @param enabledJoin - Pre-built JOIN condition restricting results to feeds
 *   enabled for the requesting user.
 * @param tables - Drizzle table references required by the query.
 * @param label - The user and label name scoping this query.
 * @param afterId - Exclusive lower bound on `articles.id`; use `0` for the
 *   first page.
 * @param beforeDate - Optional upper bound on `articles.publication_date`;
 *   omit to include all dates.
 * @returns A promise resolving to an ordered array of `{ articleId }` rows.
 */
function listLabelStreamArticleIds(
  db: DbInstance,
  enabledJoin: ReturnType<typeof and>,
  tables: DbTables,
  label: LabelStream,
  afterId: number,
  beforeDate: Date | undefined,
) {
  return createBaseArticleIdQuery(db, enabledJoin, tables)
    .innerJoin(
      tables.feedCategories,
      and(
        eq(tables.feedCategories.feedId, tables.feeds.id),
        eq(tables.feedCategories.userId, label.userId),
        eq(tables.feedCategories.category, label.userLabel),
      ),
    )
    .where(
      and(
        gt(tables.articles.id, afterId),
        beforeDate
          ? lt(tables.articles.publicationDate, beforeDate)
          : undefined,
      ),
    )
    .orderBy(tables.articles.id)
    .limit(MARK_ALL_READ_BATCH_SIZE);
}

/**
 * Queries article IDs for the starred stream, joining through
 * `articleStatuses` to filter by `isStarred = true`, with an exclusive cursor
 * on `articles.id` for stable pagination.
 *
 * @param db - Active database instance.
 * @param enabledJoin - Pre-built JOIN condition restricting results to feeds
 *   enabled for the requesting user.
 * @param tables - Drizzle table references required by the query.
 * @param userId - The ID of the user whose starred articles are queried.
 * @param afterId - Exclusive lower bound on `articles.id`; use `0` for the
 *   first page.
 * @param beforeDate - Optional upper bound on `articles.publication_date`;
 *   omit to include all dates.
 * @returns A promise resolving to an ordered array of `{ articleId }` rows.
 */
function listStarredStreamArticleIds(
  db: DbInstance,
  enabledJoin: ReturnType<typeof and>,
  tables: DbTables,
  userId: number,
  afterId: number,
  beforeDate: Date | undefined,
) {
  return createBaseArticleIdQuery(db, enabledJoin, tables)
    .innerJoin(
      tables.articleStatuses,
      and(
        eq(tables.articleStatuses.userId, userId),
        eq(tables.articleStatuses.articleId, tables.articles.id),
      ),
    )
    .where(
      and(
        eq(tables.articleStatuses.isStarred, true),
        gt(tables.articles.id, afterId),
        beforeDate
          ? lt(tables.articles.publicationDate, beforeDate)
          : undefined,
      ),
    )
    .orderBy(tables.articles.id)
    .limit(MARK_ALL_READ_BATCH_SIZE);
}
/**
 * Dispatches to the appropriate list-articles query based on the stream type,
 * threading the pagination cursor and all shared query options through to the
 * underlying query builder.
 *
 * @param options - Query options including the pagination cursor, stream
 *   context, database instance, and pre-built JOIN/table references.
 * @returns A promise resolving to at most {@link MARK_ALL_READ_BATCH_SIZE}
 *   `{ articleId }` rows ordered by ascending `articles.id`.
 */
async function resolveArticleIdsForStream(
  options: ArticleIdsForStreamOptions,
): Promise<ArticleIdRow[]> {
  const {
    afterId,
    beforeDate,
    db,
    enabledJoin,
    stream,
    tables,
    useArticleStatuses,
    userId,
    userLabel,
  } = options;

  if (stream.startsWith(FEED_STREAM_PREFIX)) {
    return listFeedStreamArticleIds(
      db,
      enabledJoin,
      tables,
      stream.slice(FEED_STREAM_PREFIX.length),
      afterId,
      beforeDate,
    );
  }

  if (stream === STARRED_STATE) {
    return useArticleStatuses
      ? listStarredStreamArticleIds(
          db,
          enabledJoin,
          tables,
          userId,
          afterId,
          beforeDate,
        )
      : [];
  }

  if (userLabel !== null) {
    return listLabelStreamArticleIds(
      db,
      enabledJoin,
      tables,
      { userId, userLabel },
      afterId,
      beforeDate,
    );
  }

  return listAllStreamArticleIds(db, enabledJoin, tables, afterId, beforeDate);
}

/**
 * Resolves and normalizes optional dependency overrides for
 * {@link markStreamAsRead}, applying production defaults for any values not
 * supplied by the caller. This pattern keeps the main function testable without
 * exposing internal wiring in its public signature.
 *
 * @param deps - Caller-supplied overrides (typically injected in tests).
 * @param getDbFn - Factory that produces the live database instance; used only
 *   when `deps.db` is absent.
 * @returns A fully-resolved dependency object ready for use by
 *   {@link markStreamAsRead}.
 */
function resolveMarkStreamAsReadDeps(
  deps: MarkStreamAsReadDeps | undefined,
  getDbFn: () => DbInstance,
) {
  return {
    beforeDate: deps?.beforeMs ? new Date(deps.beforeMs) : undefined,
    canUseArticleStatuses:
      deps?.canUseArticleStatusesTableFn ?? canUseArticleStatusesTable,
    db: deps?.db ?? getDbFn(),
    upsertStatuses: deps?.upsertArticleStatusesFn ?? upsertArticleStatuses,
  };
}

/**
 * Logs when mark-all-read stops early after reaching the hard safety cap.
 * @param stream - The stream ID whose mark-all-read pass hit the hard limit.
 */
function warnMarkAllReadHardLimit(stream: string): void {
  logger.warn(
    `markStreamAsRead: hard limit of ${MARK_ALL_READ_HARD_LIMIT} articles reached for stream "${stream}"; stopping early.`,
  );
}
