import { and, eq, lt } from "drizzle-orm";

import { FEED_STREAM_PREFIX, parseUserLabel, STARRED_STATE } from "@/lib/core";

import { canUseArticleStatusesTable, upsertArticleStatuses } from "./status";

type DbInstance = ReturnType<DbMod["getDb"]>;
type DbMod = typeof import("@/lib/db");
type DbTables = Pick<
  DbMod,
  "articles" | "articleStatuses" | "feedCategories" | "feeds" | "feedSources"
>;

// Upper bound for mark-all-as-read to prevent unbounded queries.
const MARK_ALL_READ_LIMIT = 10_000;

interface ArticleIdRow {
  articleId: number;
}

interface MarkStreamAsReadDeps {
  beforeMs?: number;
  canUseArticleStatusesTableFn?: typeof canUseArticleStatusesTable;
  db?: DbInstance;
  upsertArticleStatusesFn?: typeof upsertArticleStatuses;
}

/**
 * Mark all articles in a stream as read for the given user.
 *
 * Shared by mark-all-read flows that operate on feed, label, or starred
 * streams.
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
  const tables: DbTables = {
    articles,
    articleStatuses,
    feedCategories,
    feeds,
    feedSources,
  };
  const resolvedDeps = resolveMarkStreamAsReadDeps(deps, getDbFn);
  const userLabel = parseUserLabel(stream);
  const useArticleStatuses = await resolvedDeps.canUseArticleStatuses();
  const enabledJoin = buildEnabledFeedJoin(userId, tables);
  const rows = await resolveArticleIdsForStream({
    beforeDate: resolvedDeps.beforeDate,
    db: resolvedDeps.db,
    enabledJoin,
    stream,
    tables,
    useArticleStatuses,
    userId,
    userLabel,
  });

  await resolvedDeps.upsertStatuses(
    userId,
    rows.map((row) => row.articleId),
    { isRead: true },
  );
}

function buildEnabledFeedJoin(userId: number, tables: DbTables) {
  return and(
    eq(tables.feedSources.url, tables.feeds.url),
    eq(tables.feedSources.userId, userId),
    eq(tables.feedSources.enabled, true),
  );
}

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

function listAllStreamArticleIds(
  db: DbInstance,
  enabledJoin: ReturnType<typeof and>,
  tables: DbTables,
  beforeDate: Date | undefined,
) {
  return createBaseArticleIdQuery(db, enabledJoin, tables)
    .where(
      beforeDate ? lt(tables.articles.publicationDate, beforeDate) : undefined,
    )
    .limit(MARK_ALL_READ_LIMIT);
}

function listFeedStreamArticleIds(
  db: DbInstance,
  enabledJoin: ReturnType<typeof and>,
  tables: DbTables,
  feedUrl: string,
  beforeDate: Date | undefined,
) {
  return createBaseArticleIdQuery(db, enabledJoin, tables)
    .where(
      and(
        eq(tables.feeds.url, feedUrl),
        beforeDate
          ? lt(tables.articles.publicationDate, beforeDate)
          : undefined,
      ),
    )
    .limit(MARK_ALL_READ_LIMIT);
}

function listLabelStreamArticleIds(
  db: DbInstance,
  enabledJoin: ReturnType<typeof and>,
  tables: DbTables,
  userId: number,
  userLabel: string,
  beforeDate: Date | undefined,
) {
  return createBaseArticleIdQuery(db, enabledJoin, tables)
    .innerJoin(
      tables.feedCategories,
      and(
        eq(tables.feedCategories.feedId, tables.feeds.id),
        eq(tables.feedCategories.userId, userId),
        eq(tables.feedCategories.category, userLabel),
      ),
    )
    .where(
      beforeDate ? lt(tables.articles.publicationDate, beforeDate) : undefined,
    )
    .limit(MARK_ALL_READ_LIMIT);
}

function listStarredStreamArticleIds(
  db: DbInstance,
  enabledJoin: ReturnType<typeof and>,
  tables: DbTables,
  userId: number,
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
        beforeDate
          ? lt(tables.articles.publicationDate, beforeDate)
          : undefined,
      ),
    )
    .limit(MARK_ALL_READ_LIMIT);
}

async function resolveArticleIdsForStream({
  beforeDate,
  db,
  enabledJoin,
  stream,
  tables,
  useArticleStatuses,
  userId,
  userLabel,
}: {
  beforeDate: Date | undefined;
  db: DbInstance;
  enabledJoin: ReturnType<typeof and>;
  stream: string;
  tables: DbTables;
  useArticleStatuses: boolean;
  userId: number;
  userLabel: null | string;
}): Promise<ArticleIdRow[]> {
  if (stream.startsWith(FEED_STREAM_PREFIX)) {
    return listFeedStreamArticleIds(
      db,
      enabledJoin,
      tables,
      stream.slice(FEED_STREAM_PREFIX.length),
      beforeDate,
    );
  }

  if (stream === STARRED_STATE) {
    return useArticleStatuses
      ? listStarredStreamArticleIds(db, enabledJoin, tables, userId, beforeDate)
      : [];
  }

  if (userLabel !== null) {
    return listLabelStreamArticleIds(
      db,
      enabledJoin,
      tables,
      userId,
      userLabel,
      beforeDate,
    );
  }

  return listAllStreamArticleIds(db, enabledJoin, tables, beforeDate);
}

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
