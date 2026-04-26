-- Enable the pg_trgm extension so Postgres can build GIN trigram indexes used
-- for fast ILIKE pattern matching in the article search query. The extension is
-- idempotent; running it again on an already-enabled database is safe.
CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint

-- GIN trigram index on article title.  Titles are short and high-cardinality,
-- making this the most impactful index for search performance.
CREATE INDEX IF NOT EXISTS "article_title_trgm_idx"
  ON "Article" USING gin (title gin_trgm_ops);--> statement-breakpoint

-- GIN trigram index on article content.  Content is searched by the
-- `article.content ILIKE %pattern%` condition in the batch query.  Without
-- this index every search performs a full sequential scan over every stored
-- article row; with it Postgres can narrow the candidate set in O(log n) time
-- via the trigram inverted index before evaluating the ILIKE predicate.
CREATE INDEX IF NOT EXISTS "article_content_trgm_idx"
  ON "Article" USING gin (content gin_trgm_ops);
