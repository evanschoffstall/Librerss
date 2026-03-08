CREATE INDEX "session_user_created_at_idx" ON "Session"("user_id","created_at");--> statement-breakpoint
CREATE INDEX "feed_category_user_category_idx" ON "FeedCategory"("user_id","category");
