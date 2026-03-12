import { and, desc, eq } from "drizzle-orm";

import { type getDb } from "@/lib/db/db";
import { articles, feeds, feedSources } from "@/lib/db/schema";
import {
  normalizeArticleHtmlSpacing,
  stripOrphanedRelatedBlocks,
} from "@/lib/sanitize";

interface UserOwnedArticle {
  content: null | string;
  feedId: number;
  id: number;
  lastChecked: Date;
  link: string;
  publicationDate: Date;
  title: string;
}

const articleSelect = {
  content: articles.content,
  feedId: articles.feedId,
  id: articles.id,
  lastChecked: articles.lastChecked,
  link: articles.link,
  publicationDate: articles.publicationDate,
  title: articles.title,
};

export async function getUserOwnedArticleById(
  db: ReturnType<typeof getDb>,
  userId: number,
  articleId: number,
): Promise<null | UserOwnedArticle> {
  const [article] = await db
    .select(articleSelect)
    .from(articles)
    .innerJoin(feeds, eq(feeds.id, articles.feedId))
    .innerJoin(feedSources, enabledFeedSourceJoin(userId))
    .where(eq(articles.id, articleId))
    .limit(1);

  return article ?? null;
}

export async function listUserOwnedArticles(
  db: ReturnType<typeof getDb>,
  userId: number,
  limit: number,
): Promise<UserOwnedArticle[]> {
  return db
    .select(articleSelect)
    .from(articles)
    .innerJoin(feeds, eq(feeds.id, articles.feedId))
    .innerJoin(feedSources, enabledFeedSourceJoin(userId))
    .orderBy(desc(articles.publicationDate))
    .limit(limit);
}

export function withNormalizedArticleContent<
  T extends { content: null | string },
>(article: T): T {
  if (!article.content) {
    return article;
  }

  return {
    ...article,
    content: normalizeArticleHtmlSpacing(
      stripOrphanedRelatedBlocks(article.content),
    ),
  };
}

function enabledFeedSourceJoin(userId: number) {
  return and(
    eq(feedSources.url, feeds.url),
    eq(feedSources.userId, userId),
    eq(feedSources.enabled, true),
  );
}
