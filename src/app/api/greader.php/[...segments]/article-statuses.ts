import { getDb } from "@/lib/db/db";
import { articleStatuses } from "@/lib/db/schema";
import { and, eq, inArray } from "drizzle-orm";

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
  console.warn(
    "[greader] ArticleStatus table is missing; read/starred state will be treated as unavailable until database schema is provisioned.",
  );
}

export async function canUseArticleStatusesTable(): Promise<boolean> {
  if (articleStatusesTableState === "available") {
    return true;
  }

  if (articleStatusesTableState === "missing") {
    return false;
  }

  try {
    const db = getDb();
    await db.select({ id: articleStatuses.id }).from(articleStatuses).limit(1);
    articleStatusesTableState = "available";
    return true;
  } catch (error) {
    if (isMissingArticleStatusesTableError(error)) {
      articleStatusesTableState = "missing";
      warnMissingArticleStatusesTable();
      return false;
    }

    throw error;
  }
}

export function isSafePositiveItemId(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value > 0 &&
    value <= Number.MAX_SAFE_INTEGER
  );
}

export async function upsertArticleStatuses(
  userId: number,
  articleIds: number[],
  changes: { isRead?: boolean; isStarred?: boolean },
): Promise<void> {
  if (articleIds.length === 0) {
    return;
  }

  if (!(await canUseArticleStatusesTable())) {
    return;
  }

  const db = getDb();

  const existingRows = await db
    .select({
      articleId: articleStatuses.articleId,
      isRead: articleStatuses.isRead,
      isStarred: articleStatuses.isStarred,
    })
    .from(articleStatuses)
    .where(
      and(
        eq(articleStatuses.userId, userId),
        inArray(articleStatuses.articleId, articleIds),
      ),
    );

  const existingByArticleId = new Map(
    existingRows.map((row) => [row.articleId, row]),
  );

  for (const articleId of articleIds) {
    const existing = existingByArticleId.get(articleId);

    await db
      .insert(articleStatuses)
      .values({
        userId,
        articleId,
        isRead: changes.isRead ?? existing?.isRead ?? false,
        isStarred: changes.isStarred ?? existing?.isStarred ?? false,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [articleStatuses.userId, articleStatuses.articleId],
        set: {
          isRead: changes.isRead ?? existing?.isRead ?? false,
          isStarred: changes.isStarred ?? existing?.isStarred ?? false,
          updatedAt: new Date(),
        },
      });
  }
}
