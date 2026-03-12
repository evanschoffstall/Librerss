import { eq } from "drizzle-orm";

import { buildUserCategoryJoin } from "./stream-joins";

import { getDb } from "@/lib/db/db";
import { feedCategories, feeds, feedSources } from "@/lib/db/schema";

interface UserSubscriptionRow {
  category: null | string;
  feedId: null | number;
  sourceId: number;
  title: string;
  url: string;
}

export async function loadUserSubscriptionRows(
  userId: number,
): Promise<UserSubscriptionRow[]> {
  const db = getDb();

  return db
    .select({
      category: feedCategories.category,
      feedId: feeds.id,
      sourceId: feedSources.id,
      title: feedSources.name,
      url: feedSources.url,
    })
    .from(feedSources)
    .leftJoin(feeds, eq(feeds.url, feedSources.url))
    .leftJoin(feedCategories, buildUserCategoryJoin())
    .where(eq(feedSources.userId, userId));
}
