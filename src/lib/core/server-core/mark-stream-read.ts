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

interface ArticleIdsForStreamOptions {
  beforeDate: Date | undefined;
  db: DbInstance;
  enabledJoin: ReturnType<typeof and>;
  stream: string;
  tables: DbTables;
  useArticleStatuses: boolean;
  userId: number;
  userLabel: null | string;
}

interface MarkStreamAsReadDeps {
  beforeMs?: number;
  canUseArticleStatusesTableFn?: typeof canUseArticleStatusesTable;
  db?: DbInstance;
  upsertArticleStatusesFn?: typeof upsertArticleStatuses;
}

/**
 * Process the mark stream as read.
 * @param userId - The r id.
 * @param stream - The stream.
 * @param deps - The deps.
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

/**
 * Build the enabled feed join.
 * @param userId - The r id.
 * @param tables - The tables.
 * @returns The enabled feed join.
 */
function buildEnabledFeedJoin(userId: number, tables: DbTables) {
  return and(
    eq(tables.feedSources.url, tables.feeds.url),
    eq(tables.feedSources.userId, userId),
    eq(tables.feedSources.enabled, true),
  );
}

/**
 * Create the base article id query.
 * @param db - The db.
 * @param enabledJoin - The enabled join.
 * @param tables - The tables.
 * @returns The base article id query.
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
 * Process the list all stream article ids.
 * @param db - The db.
 * @param enabledJoin - The enabled join.
 * @param tables - The tables.
 * @param beforeDate - The before date.
 * @returns The list all stream article ids.
 */
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

/**
 * Process the list feed stream article ids.
 * @param db - The db.
 * @param enabledJoin - The enabled join.
 * @param tables - The tables.
 * @param feedUrl - The feed url.
 * @param beforeDate - The before date.
 * @returns The list feed stream article ids.
 */
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

/**
 * Process the list label stream article ids.
 * @param db - The db.
 * @param enabledJoin - The enabled join.
 * @param tables - The tables.
 * @param userId - The r id.
 * @param userLabel - The r label.
 * @param beforeDate - The before date.
 * @returns The list label stream article ids.
 */
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
/**
 * Process the list starred stream article ids.
 * @param db - The db.
 * @param enabledJoin - The enabled join.
 * @param tables - The tables.
 * @param userId - The r id.
 * @param beforeDate - The before date.
 * @returns The list starred stream article ids.
 */
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

/**
 * Resolve the article ids for stream.
 * @param options - The options used to resolve the article ids for stream.
 * @returns The article ids for stream.
 */
async function resolveArticleIdsForStream(
  options: ArticleIdsForStreamOptions,
): Promise<ArticleIdRow[]> {
  const {
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

/**
 * Resolve the mark stream as read deps.
 * @param deps - The deps.
 * @param getDbFn - The callback that db fn.
 * @returns The mark stream as read deps.
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
