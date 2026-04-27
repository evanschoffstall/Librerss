-- Keep the expanded live-search predicate fast after adding article URL,
-- source metadata, and category matching alongside title/content matching.
CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "article_link_trgm_idx"
  ON "Article" USING gin (link gin_trgm_ops);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "feed_source_name_trgm_idx"
  ON "FeedSource" USING gin (name gin_trgm_ops);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "feed_source_url_trgm_idx"
  ON "FeedSource" USING gin (url gin_trgm_ops);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "feed_category_category_trgm_idx"
  ON "FeedCategory" USING gin (category gin_trgm_ops);