import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";

export const users = pgTable("User", {
  id: serial("id").primaryKey(),
  email: varchar("email", { length: 320 }).notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const sessions = pgTable(
  "Session",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", {
      mode: "date",
      withTimezone: true,
    }).notNull(),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    tokenHashIdx: uniqueIndex("session_token_hash_idx").on(table.tokenHash),
  }),
);

export const feeds = pgTable("Feed", {
  id: serial("id").primaryKey(),
  url: text("url").notNull().unique(),
  lastFetched: timestamp("last_fetched", { mode: "date", withTimezone: true })
    .notNull()
    .default(sql`(now() - interval '1 day')`),
  lastFetchError: text("last_fetch_error"),
});

export const articles = pgTable(
  "Article",
  {
    id: serial("id").primaryKey(),
    title: text("title").notNull(),
    link: text("link").notNull().unique(),
    publicationDate: timestamp("publication_date", {
      mode: "date",
      withTimezone: true,
    }).notNull(),
    content: text("content").notNull(),
    feedId: integer("feed_id")
      .notNull()
      .references(() => feeds.id, { onDelete: "cascade" }),
    lastChecked: timestamp("last_checked", { mode: "date", withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    // Speeds up per-feed article lookups (WHERE feed_id = ?)
    feedIdIdx: index("article_feed_id_idx").on(table.feedId),
    // Speeds up the common query pattern: WHERE feed_id = ? ORDER BY publication_date DESC
    feedIdPubDateIdx: index("article_feed_id_pub_date_idx").on(
      table.feedId,
      table.publicationDate,
    ),
  }),
);

export const feedSources = pgTable(
  "FeedSource",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    url: text("url").notNull(),
    enabled: boolean("enabled").notNull().default(true),
  },
  (table) => ({
    userUrlIdx: uniqueIndex("feed_source_user_url_idx").on(
      table.userId,
      table.url,
    ),
  }),
);

export const feedCategories = pgTable(
  "FeedCategory",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    feedId: integer("feed_id")
      .notNull()
      .references(() => feeds.id, { onDelete: "cascade" }),
    category: varchar("category", { length: 255 }).notNull(),
  },
  (table) => ({
    userFeedIdx: uniqueIndex("feed_category_user_feed_idx").on(
      table.userId,
      table.feedId,
    ),
  }),
);

export const categoryOrders = pgTable(
  "CategoryOrder",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    orderedLabels: text("ordered_labels").notNull().default("[]"),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    userIdx: uniqueIndex("category_order_user_idx").on(table.userId),
  }),
);

export const articleStatuses = pgTable(
  "ArticleStatus",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    articleId: integer("article_id")
      .notNull()
      .references(() => articles.id, { onDelete: "cascade" }),
    isRead: boolean("is_read").notNull().default(false),
    isStarred: boolean("is_starred").notNull().default(false),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    userArticleIdx: uniqueIndex("article_status_user_article_idx").on(
      table.userId,
      table.articleId,
    ),
    userReadIdx: index("article_status_user_read_idx").on(
      table.userId,
      table.isRead,
    ),
    userStarredIdx: index("article_status_user_starred_idx").on(
      table.userId,
      table.isStarred,
    ),
  }),
);

export const articleStatus = articleStatuses;
export const categories = feedCategories;
