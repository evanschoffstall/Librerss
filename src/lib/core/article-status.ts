import { getDb } from "@/lib/db/db";
import { articleStatuses } from "@/lib/db/schema";
import { logger } from "@/lib/logger";
import { sql } from "drizzle-orm";

// ── ArticleStatus table availability ──────────────────────────────────────────

let articleStatusesTableState: "unknown" | "available" | "missing" = "unknown";
let warnedMissingArticleStatusesTable = false;

function isMissingArticleStatusesTableError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const candidate = error as {
    code?: string;
    message?: string;
    cause?: unknown;
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

function warnMissingArticleStatusesTable(): void {
  if (warnedMissingArticleStatusesTable) {
    return;
  }

  warnedMissingArticleStatusesTable = true;
  logger.warn(
    "ArticleStatus table is missing; read/starred state will be treated as unavailable until database schema is provisioned.",
  );
}

export function resetArticleStatusTableStateForTests(): void {
  articleStatusesTableState = "unknown";
  warnedMissingArticleStatusesTable = false;
}

type ArticleStatusDeps = {
  db?: ReturnType<typeof getDb>;
  warn?: (message: string) => void;
};

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
    const db = deps?.db ?? getDb();
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

// ── Batch upsert ──────────────────────────────────────────────────────────────

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

  const db = deps?.db ?? getDb();
  const now = new Date();

  // Batch upsert: build a single INSERT ... ON CONFLICT DO UPDATE for all
  // article IDs instead of N individual queries.  For fields not specified in
  // `changes`, preserve the existing value via COALESCE on the excluded row
  // and the current DB row (defaulting to false for new rows).
  const values = articleIds.map((articleId) => ({
    userId,
    articleId,
    isRead: changes.isRead ?? false,
    isStarred: changes.isStarred ?? false,
    updatedAt: now,
  }));

  // Process in chunks of 500 to stay within PG parameter limits.
  const CHUNK_SIZE = 500;
  for (let i = 0; i < values.length; i += CHUNK_SIZE) {
    const chunk = values.slice(i, i + CHUNK_SIZE);

    await db
      .insert(articleStatuses)
      .values(chunk)
      .onConflictDoUpdate({
        target: [articleStatuses.userId, articleStatuses.articleId],
        set: {
          isRead:
            changes.isRead !== undefined
              ? changes.isRead
              : sql`${articleStatuses.isRead}`,
          isStarred:
            changes.isStarred !== undefined
              ? changes.isStarred
              : sql`${articleStatuses.isStarred}`,
          updatedAt: now,
        },
      });
  }
}
