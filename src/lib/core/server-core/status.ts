import { sql } from "drizzle-orm";

import { logger } from "@/lib";

type DbMod = typeof import("@/lib/db");

// ── ArticleStatus table availability ──────────────────────────────────────────

let articleStatusesTableState: "available" | "missing" | "unknown" = "unknown";
let warnedMissingArticleStatusesTable = false;

interface ArticleStatusDeps {
  db?: ReturnType<DbMod["getDb"]>;
  warn?: (message: string) => void;
}

export async function canUseArticleStatusesTable(
  deps?: ArticleStatusDeps,
): Promise<boolean> {
  if (articleStatusesTableState === "available") {
    return true;
  }

  if (articleStatusesTableState === "missing") {
    return false;
  }

  try {
    const { articleStatuses, getDb: getDbFn } = await import("@/lib/db");
    const db = deps?.db ?? getDbFn();
    await db.select({ id: articleStatuses.id }).from(articleStatuses).limit(1);
    articleStatusesTableState = "available";
    return true;
  } catch (error) {
    if (isMissingArticleStatusesTableError(error)) {
      articleStatusesTableState = "missing";
      if (deps?.warn) {
        if (!warnedMissingArticleStatusesTable) {
          warnedMissingArticleStatusesTable = true;
          deps.warn(
            "ArticleStatus table is missing; read/starred state will be treated as unavailable until database schema is provisioned.",
          );
        }
      } else {
        warnMissingArticleStatusesTable();
      }
      return false;
    }

    throw error;
  }
}

export function resetArticleStatusTableStateForTests(): void {
  articleStatusesTableState = "unknown";
  warnedMissingArticleStatusesTable = false;
}

export async function upsertArticleStatuses(
  userId: number,
  articleIds: number[],
  changes: { isRead?: boolean; isStarred?: boolean },
  deps?: ArticleStatusDeps,
): Promise<void> {
  if (articleIds.length === 0) {
    return;
  }

  if (!(await canUseArticleStatusesTable(deps))) {
    return;
  }

  const { articleStatuses, getDb: getDbFn } = await import("@/lib/db");
  const db = deps?.db ?? getDbFn();
  const now = new Date();

  // Batch upsert: build a single INSERT ... ON CONFLICT DO UPDATE for all
  // article IDs instead of N individual queries.  For fields not specified in
  // `changes`, preserve the existing value via COALESCE on the excluded row
  // and the current DB row (defaulting to false for new rows).
  const values = articleIds.map((articleId) => ({
    articleId,
    isRead: changes.isRead ?? false,
    isStarred: changes.isStarred ?? false,
    updatedAt: now,
    userId,
  }));

  // Process in chunks of 500 to stay within PG parameter limits.
  // Wrap all chunks in a single transaction so a partial failure doesn't leave
  // some articles marked read/starred while others are not.
  const CHUNK_SIZE = 500;
  await db.transaction(async (tx) => {
    for (let i = 0; i < values.length; i += CHUNK_SIZE) {
      const chunk = values.slice(i, i + CHUNK_SIZE);

      await tx
        .insert(articleStatuses)
        .values(chunk)
        .onConflictDoUpdate({
          set: {
            isRead: changes.isRead ?? sql`${articleStatuses.isRead}`,
            isStarred: changes.isStarred ?? sql`${articleStatuses.isStarred}`,
            updatedAt: now,
          },
          target: [articleStatuses.userId, articleStatuses.articleId],
          // Skip no-op updates: only write when a tracked field actually changes.
          where: sql`${articleStatuses.isRead} IS DISTINCT FROM excluded.is_read OR ${articleStatuses.isStarred} IS DISTINCT FROM excluded.is_starred`,
        });
    }
  });
}

function isMissingArticleStatusesTableError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const candidate = error as {
    cause?: unknown;
    code?: string;
    message?: string;
  };

  const hasMissingRelationCode = candidate.code === "42P01";
  const mentionsArticleStatuses =
    typeof candidate.message === "string" &&
    candidate.message.toLowerCase().includes("articlestatus");

  if (hasMissingRelationCode && mentionsArticleStatuses) {
    return true;
  }

  return isMissingArticleStatusesTableError(candidate.cause);
}

// ── Batch upsert ──────────────────────────────────────────────────────────────

function warnMissingArticleStatusesTable(): void {
  if (warnedMissingArticleStatusesTable) {
    return;
  }

  warnedMissingArticleStatusesTable = true;
  logger.warn(
    "ArticleStatus table is missing; read/starred state will be treated as unavailable until database schema is provisioned.",
  );
}
