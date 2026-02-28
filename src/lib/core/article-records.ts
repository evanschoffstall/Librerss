import { type getDb } from "@/lib/db/db";
import { articles, feeds, feedSources } from "@/lib/db/schema";
import {
  normalizeArticleHtmlSpacing,
  stripOrphanedRelatedBlocks,
} from "@/lib/sanitize";
import { and, desc, eq } from "drizzle-orm";

type UserOwnedArticle = {
  id: number;
  title: string;
  link: string;
  content: string | null;
  publicationDate: Date;
  lastChecked: Date;
  feedId: number;
};

const articleSelect = {
  id: articles.id,
  title: articles.title,
  link: articles.link,
  content: articles.content,
  publicationDate: articles.publicationDate,
  lastChecked: articles.lastChecked,
  feedId: articles.feedId,
};

function enabledFeedSourceJoin(userId: number) {
  return and(
    eq(feedSources.url, feeds.url),
    eq(feedSources.userId, userId),
    eq(feedSources.enabled, true),
  );
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

export async function getUserOwnedArticleById(
  db: ReturnType<typeof getDb>,
  userId: number,
  articleId: number,
): Promise<UserOwnedArticle | null> {
  const [article] = await db
    .select(articleSelect)
    .from(articles)
    .innerJoin(feeds, eq(feeds.id, articles.feedId))
    .innerJoin(feedSources, enabledFeedSourceJoin(userId))
    .where(eq(articles.id, articleId))
    .limit(1);

  return article ?? null;
}

export function withNormalizedArticleContent<
  T extends { content: string | null },
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
