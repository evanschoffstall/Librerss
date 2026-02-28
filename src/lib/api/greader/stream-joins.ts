import {
  articleStatuses,
  articles,
  feedCategories,
  feedSources,
  feeds,
} from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";

export function buildUserFeedJoin(userId: number) {
  return and(
    eq(feedSources.url, feeds.url),
    eq(feedSources.userId, userId),
    eq(feedSources.enabled, true),
  );
}

export function buildUserCategoryJoin() {
  return and(
    eq(feedCategories.userId, feedSources.userId),
    eq(feedCategories.feedId, feeds.id),
  );
}

export function buildUserArticleStatusJoin(userId: number) {
  return and(
    eq(articleStatuses.userId, userId),
    eq(articleStatuses.articleId, articles.id),
  );
}
