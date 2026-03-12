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
  allowInsecureTls: boolean("allow_insecure_tls").notNull().default(false),
  createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
    .notNull()
    .defaultNow(),
  email: varchar("email", { length: 320 }).notNull().unique(),
  id: serial("id").primaryKey(),
  lastForceRefreshedAt: timestamp("last_force_refreshed_at", {
    mode: "date",
    withTimezone: true,
  }),
  passwordHash: text("password_hash").notNull(),
  proxyPassword: text("proxy_password"),
  proxyUrl: text("proxy_url"),
  proxyUsername: text("proxy_username"),
});

export const sessions = pgTable(
  "Session",
  {
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
      .notNull()
      .defaultNow(),
    expiresAt: timestamp("expires_at", {
      mode: "date",
      withTimezone: true,
    }).notNull(),
    id: serial("id").primaryKey(),
    tokenHash: text("token_hash").notNull(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
  },
  (table) => ({
    tokenHashIdx: uniqueIndex("session_token_hash_idx").on(table.tokenHash),
    // Speeds up session-limit enforcement: SELECT WHERE userId ORDER BY createdAt
    userCreatedAtIdx: index("session_user_created_at_idx").on(
      table.userId,
      table.createdAt,
    ),
  }),
);

export const feeds = pgTable("Feed", {
  id: serial("id").primaryKey(),
  lastFetched: timestamp("last_fetched", { mode: "date", withTimezone: true })
    .notNull()
    .default(sql`(now() - interval '1 day')`),
  lastFetchError: text("last_fetch_error"),
  url: text("url").notNull().unique(),
});

export const articles = pgTable(
  "Article",
  {
    content: text("content").notNull(),
    feedId: integer("feed_id")
      .notNull()
      .references(() => feeds.id, { onDelete: "cascade" }),
    id: serial("id").primaryKey(),
    lastChecked: timestamp("last_checked", { mode: "date", withTimezone: true })
      .notNull()
      .defaultNow(),
    link: text("link").notNull().unique(),
    publicationDate: timestamp("publication_date", {
      mode: "date",
      withTimezone: true,
    }).notNull(),
    title: text("title").notNull(),
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
    enabled: boolean("enabled").notNull().default(true),
    extractionDisabled: boolean("extraction_disabled").notNull().default(false),
    id: serial("id").primaryKey(),
    name: varchar("name", { length: 255 }).notNull(),
    proxyEnabled: boolean("proxy_enabled").notNull().default(false),
    url: text("url").notNull(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
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
    category: varchar("category", { length: 255 }).notNull(),
    feedId: integer("feed_id")
      .notNull()
      .references(() => feeds.id, { onDelete: "cascade" }),
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
  },
  (table) => ({
    // Speeds up delete/update by label (disable-tag, rename-tag)
    userCategoryIdx: index("feed_category_user_category_idx").on(
      table.userId,
      table.category,
    ),
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
    orderedLabels: text("ordered_labels").notNull().default("[]"),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true })
      .notNull()
      .defaultNow(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
  },
  (table) => ({
    userIdx: uniqueIndex("category_order_user_idx").on(table.userId),
  }),
);

export const articleStatuses = pgTable(
  "ArticleStatus",
  {
    articleId: integer("article_id")
      .notNull()
      .references(() => articles.id, { onDelete: "cascade" }),
    id: serial("id").primaryKey(),
    isRead: boolean("is_read").notNull().default(false),
    isStarred: boolean("is_starred").notNull().default(false),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true })
      .notNull()
      .defaultNow(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
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
