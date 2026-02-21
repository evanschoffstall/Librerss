import { sql } from "drizzle-orm";
import {
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
});

export const articles = pgTable("Article", {
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
    .references(() => feeds.id),
  lastChecked: timestamp("last_checked", { mode: "date", withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const feedSources = pgTable(
  "FeedSource",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    url: text("url").notNull(),
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
      .references(() => feeds.id),
    category: varchar("category", { length: 255 }).notNull(),
  },
  (table) => ({
    userFeedIdx: uniqueIndex("feed_category_user_feed_idx").on(
      table.userId,
      table.feedId,
    ),
  }),
);
