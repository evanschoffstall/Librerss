import { and, eq, lt, sql } from "drizzle-orm";

import { articles, articleStatuses, feeds } from "@/lib/db/schema";

export function buildStreamConditions({
  continuationId,
  dateFilter,
  excludeRead,
  feedUrl,
  starredOnly,
  useArticleStatuses,
}: {
  continuationId: null | number;
  dateFilter: Date | null;
  excludeRead?: boolean;
  feedUrl: null | string;
  starredOnly: boolean;
  useArticleStatuses: boolean;
}): Parameters<typeof and> {
  const conditions: Parameters<typeof and> = [];

  if (feedUrl && dateFilter) {
    conditions.push(
      and(eq(feeds.url, feedUrl), lt(articles.publicationDate, dateFilter)),
    );
  } else if (feedUrl) {
    conditions.push(eq(feeds.url, feedUrl));
  } else if (dateFilter) {
    conditions.push(lt(articles.publicationDate, dateFilter));
  }

  if (starredOnly && useArticleStatuses) {
    conditions.push(eq(articleStatuses.isStarred, true));
  }

  if (excludeRead && useArticleStatuses) {
    conditions.push(sql`coalesce(${articleStatuses.isRead}, false) = false`);
  }

  if (continuationId) {
    conditions.push(lt(articles.id, continuationId));
  }

  return conditions;
}
