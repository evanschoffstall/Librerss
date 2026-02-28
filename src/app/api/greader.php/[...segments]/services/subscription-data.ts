import { getDb } from "@/lib/db/db";
import { feedCategories, feeds, feedSources } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { buildUserCategoryJoin } from "./stream-joins";

export type UserSubscriptionRow = {
  sourceId: number;
  title: string;
  url: string;
  feedId: number | null;
  category: string | null;
};

export async function loadUserSubscriptionRows(
  userId: number,
): Promise<UserSubscriptionRow[]> {
  const db = getDb();

  return db
    .select({
      sourceId: feedSources.id,
      title: feedSources.name,
      url: feedSources.url,
      feedId: feeds.id,
      category: feedCategories.category,
    })
    .from(feedSources)
    .leftJoin(feeds, eq(feeds.url, feedSources.url))
    .leftJoin(feedCategories, buildUserCategoryJoin())
    .where(eq(feedSources.userId, userId));
}
