import { eq } from "drizzle-orm";

/**
 * Server-side account operations shared across API surfaces.
 *
 * Transport-agnostic: accepts typed params, returns data or throws
 * {@link ServerServiceError}.
 */
import { logger, ServerServiceError } from "@/lib";
import { RUNTIME_FLAGS } from "@/lib/core/placeholder";
import {
  articles,
  articleStatuses,
  categoryOrders,
  feedCategories,
  feeds,
  feedSources,
  getDb,
  sessions,
  users,
} from "@/lib/db";
import { getUrlCredentials } from "@/lib/utils";

/**
 * Describes the account service deps.
 */
interface AccountServiceDeps {
  getDbFn?: () => Pick<ReturnType<typeof getDb>, "select">;
}

/**
 * Describes the export account base records.
 */
interface ExportAccountBaseRecords {
  categoryOrderRows: {
    orderedLabels: typeof categoryOrders.$inferSelect.orderedLabels;
    updatedAt: typeof categoryOrders.$inferSelect.updatedAt;
  }[];
  sessionRows: {
    createdAt: typeof sessions.$inferSelect.createdAt;
    expiresAt: typeof sessions.$inferSelect.expiresAt;
    id: typeof sessions.$inferSelect.id;
  }[];
  sourceRows: {
    enabled: typeof feedSources.$inferSelect.enabled;
    extractionDisabled: typeof feedSources.$inferSelect.extractionDisabled;
    id: typeof feedSources.$inferSelect.id;
    name: typeof feedSources.$inferSelect.name;
    proxyEnabled: typeof feedSources.$inferSelect.proxyEnabled;
    url: typeof feedSources.$inferSelect.url;
  }[];
  statusRows: {
    articleId: typeof articleStatuses.$inferSelect.articleId;
    isRead: typeof articleStatuses.$inferSelect.isRead;
    isStarred: typeof articleStatuses.$inferSelect.isStarred;
    updatedAt: typeof articleStatuses.$inferSelect.updatedAt;
  }[];
  userRows: {
    allowInsecureTls: typeof users.$inferSelect.allowInsecureTls;
    createdAt: typeof users.$inferSelect.createdAt;
    email: typeof users.$inferSelect.email;
    lastForceRefreshedAt: typeof users.$inferSelect.lastForceRefreshedAt;
    proxyPassword: typeof users.$inferSelect.proxyPassword;
    proxyUrl: typeof users.$inferSelect.proxyUrl;
    proxyUsername: typeof users.$inferSelect.proxyUsername;
  }[];
}

/**
 * Describes the export account relations.
 */
interface ExportAccountRelations {
  articleRows: {
    articleId: typeof articleStatuses.$inferSelect.articleId;
    articleLink: typeof articles.$inferSelect.link;
    articleTitle: typeof articles.$inferSelect.title;
    feedUrl: typeof feeds.$inferSelect.url;
  }[];
  categoryRows: {
    category: typeof feedCategories.$inferSelect.category;
    feedId: typeof feedCategories.$inferSelect.feedId;
  }[];
}

/**
 * Describes the exported user.
 */
interface ExportedUser {
  allowInsecureTls: typeof users.$inferSelect.allowInsecureTls;
  createdAt: typeof users.$inferSelect.createdAt;
  email: typeof users.$inferSelect.email;
  hasProxyPassword: boolean;
  lastForceRefreshedAt: typeof users.$inferSelect.lastForceRefreshedAt;
  proxyUrl: null | string;
  proxyUsername: null | string;
  userId: number;
}

/**
 * Process the delete account.
 * @param userId - The user ID.
 */
export async function deleteAccount(userId: number) {
  if (RUNTIME_FLAGS.usePlaceholderData) {
    throw new ServerServiceError(
      "Account deletion is unavailable in preview mode",
      503,
    );
  }

  const db = getDb();
  const deletedUsers = await db
    .delete(users)
    .where(eq(users.id, userId))
    .returning({ id: users.id });

  if (deletedUsers.length === 0) {
    throw new ServerServiceError("Account not found", 404);
  }

  logger.warn("User deleted account", { userId });
}

/**
 * Process the export account data.
 * @param userId - The user ID.
 * @param deps - The deps.
 * @returns The export account data.
 */
export async function exportAccountData(
  userId: number,
  deps: AccountServiceDeps = {},
) {
  if (RUNTIME_FLAGS.usePlaceholderData) {
    throw new ServerServiceError(
      "Data export is unavailable in preview mode",
      503,
    );
  }

  const db = deps.getDbFn?.() ?? getDb();
  const baseRecords = await loadExportAccountBaseRecords(db, userId);
  const relations = await loadExportAccountRelations(
    db,
    userId,
    baseRecords.sourceRows.length > 0,
  );

  const user = baseRecords.userRows.at(0);
  if (!user) throw new ServerServiceError("Account not found", 404);

  logger.info("User exported account data", { userId });

  return {
    articleStatus: baseRecords.statusRows,
    articleStatusContext: relations.articleRows,
    categories: relations.categoryRows,
    categoryOrder: baseRecords.categoryOrderRows[0] ?? null,
    exportedAt: new Date().toISOString(),
    feedSources: baseRecords.sourceRows,
    sessions: baseRecords.sessionRows,
    user: buildExportedUser(userId, user),
  };
}

/**
 * Build the exported user.
 * @param userId - The user ID.
 * @param user - The user row from the database export query.
 * @returns The exported user.
 */
function buildExportedUser(
  userId: number,
  user: ExportAccountBaseRecords["userRows"][number],
): ExportedUser {
  const embeddedProxyCredentials = getEmbeddedProxyCredentials(user.proxyUrl);

  return {
    allowInsecureTls: user.allowInsecureTls,
    createdAt: user.createdAt,
    email: user.email,
    hasProxyPassword:
      user.proxyPassword !== null ||
      embeddedProxyCredentials?.password !== null,
    lastForceRefreshedAt: user.lastForceRefreshedAt,
    proxyUrl: embeddedProxyCredentials?.sanitizedUrl ?? user.proxyUrl,
    proxyUsername:
      user.proxyUsername ?? embeddedProxyCredentials?.username ?? null,
    userId,
  };
}

/**
 * Return the embedded proxy credentials.
 * @param proxyUrl - The proxy url.
 * @returns The embedded proxy credentials.
 */
function getEmbeddedProxyCredentials(proxyUrl: null | string) {
  return proxyUrl ? getUrlCredentials(proxyUrl) : null;
}

/**
 * Process the load export account base records.
 * @param db - The db.
 * @param userId - The user ID.
 * @returns The load export account base records.
 */
async function loadExportAccountBaseRecords(
  db: Pick<ReturnType<typeof getDb>, "select">,
  userId: number,
): Promise<ExportAccountBaseRecords> {
  const [userRows, sourceRows, sessionRows, categoryOrderRows, statusRows] =
    await Promise.all([
      selectUserExportRow(db, userId),
      selectExportSourceRows(db, userId),
      selectExportSessionRows(db, userId),
      selectCategoryOrderRows(db, userId),
      selectStatusRows(db, userId),
    ]);

  return {
    categoryOrderRows,
    sessionRows,
    sourceRows,
    statusRows,
    userRows,
  };
}

/**
 * Process the load export account relations.
 * @param db - The db.
 * @param userId - The user ID.
 * @param hasFeedSources - Whether has feed sources.
 * @returns The load export account relations.
 */
async function loadExportAccountRelations(
  db: Pick<ReturnType<typeof getDb>, "select">,
  userId: number,
  hasFeedSources: boolean,
): Promise<ExportAccountRelations> {
  if (!hasFeedSources) {
    return {
      articleRows: [],
      categoryRows: [],
    };
  }

  const [categoryRows, articleRows] = await Promise.all([
    db
      .select({
        category: feedCategories.category,
        feedId: feedCategories.feedId,
      })
      .from(feedCategories)
      .where(eq(feedCategories.userId, userId)),
    db
      .select({
        articleId: articleStatuses.articleId,
        articleLink: articles.link,
        articleTitle: articles.title,
        feedUrl: feeds.url,
      })
      .from(articleStatuses)
      .innerJoin(articles, eq(articles.id, articleStatuses.articleId))
      .innerJoin(feeds, eq(feeds.id, articles.feedId))
      .where(eq(articleStatuses.userId, userId)),
  ]);

  return {
    articleRows,
    categoryRows,
  };
}

/**
 * Process the select category order rows.
 * @param db - The db.
 * @param userId - The user ID.
 * @returns The select category order rows.
 */
function selectCategoryOrderRows(
  db: Pick<ReturnType<typeof getDb>, "select">,
  userId: number,
) {
  return db
    .select({
      orderedLabels: categoryOrders.orderedLabels,
      updatedAt: categoryOrders.updatedAt,
    })
    .from(categoryOrders)
    .where(eq(categoryOrders.userId, userId))
    .limit(1);
}

/**
 * Process the select export session rows.
 * @param db - The db.
 * @param userId - The user ID.
 * @returns The select export session rows.
 */
function selectExportSessionRows(
  db: Pick<ReturnType<typeof getDb>, "select">,
  userId: number,
) {
  return db
    .select({
      createdAt: sessions.createdAt,
      expiresAt: sessions.expiresAt,
      id: sessions.id,
    })
    .from(sessions)
    .where(eq(sessions.userId, userId));
}

/**
 * Process the select export source rows.
 * @param db - The db.
 * @param userId - The user ID.
 * @returns The select export source rows.
 */
function selectExportSourceRows(
  db: Pick<ReturnType<typeof getDb>, "select">,
  userId: number,
) {
  return db
    .select({
      enabled: feedSources.enabled,
      extractionDisabled: feedSources.extractionDisabled,
      id: feedSources.id,
      name: feedSources.name,
      proxyEnabled: feedSources.proxyEnabled,
      url: feedSources.url,
    })
    .from(feedSources)
    .where(eq(feedSources.userId, userId));
}

/**
 * Process the select status rows.
 * @param db - The db.
 * @param userId - The user ID.
 * @returns The select status rows.
 */
function selectStatusRows(
  db: Pick<ReturnType<typeof getDb>, "select">,
  userId: number,
) {
  return db
    .select({
      articleId: articleStatuses.articleId,
      isRead: articleStatuses.isRead,
      isStarred: articleStatuses.isStarred,
      updatedAt: articleStatuses.updatedAt,
    })
    .from(articleStatuses)
    .where(eq(articleStatuses.userId, userId));
}

/**
 * Process the select user export row.
 * @param db - The db.
 * @param userId - The user ID.
 * @returns The select user export row.
 */
function selectUserExportRow(
  db: Pick<ReturnType<typeof getDb>, "select">,
  userId: number,
) {
  return db
    .select({
      allowInsecureTls: users.allowInsecureTls,
      createdAt: users.createdAt,
      email: users.email,
      lastForceRefreshedAt: users.lastForceRefreshedAt,
      proxyPassword: users.proxyPassword,
      proxyUrl: users.proxyUrl,
      proxyUsername: users.proxyUsername,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
}
