import { sql } from "drizzle-orm";
import {
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";

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

export const feedSources = pgTable("FeedSource", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull().unique(),
  url: text("url").notNull(),
});

export const feedCategories = pgTable("FeedCategory", {
  id: serial("id").primaryKey(),
  feedId: integer("feed_id")
    .notNull()
    .references(() => feeds.id),
  category: varchar("category", { length: 255 }).notNull(),
});
