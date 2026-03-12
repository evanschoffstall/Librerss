import { and, eq } from "drizzle-orm";

import {
  articles,
  articleStatuses,
  feedCategories,
  feeds,
  feedSources,
} from "@/lib/db/schema";

export function buildUserArticleStatusJoin(userId: number) {
  return and(
    eq(articleStatuses.userId, userId),
    eq(articleStatuses.articleId, articles.id),
  );
}

export function buildUserCategoryJoin() {
  return and(
    eq(feedCategories.userId, feedSources.userId),
    eq(feedCategories.feedId, feeds.id),
  );
}

export function buildUserFeedJoin(userId: number) {
  return and(
    eq(feedSources.url, feeds.url),
    eq(feedSources.userId, userId),
    eq(feedSources.enabled, true),
  );
}
