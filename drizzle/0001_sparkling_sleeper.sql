ALTER TABLE "Article" DROP CONSTRAINT "Article_feed_id_Feed_id_fk";
--> statement-breakpoint
ALTER TABLE "FeedCategory" DROP CONSTRAINT "FeedCategory_feed_id_Feed_id_fk";
--> statement-breakpoint
ALTER TABLE "FeedSource" ADD COLUMN "enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "FeedSource" ADD COLUMN "extraction_disabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "FeedSource" ADD COLUMN "proxy_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "Article" ADD CONSTRAINT "Article_feed_id_Feed_id_fk" FOREIGN KEY ("feed_id") REFERENCES "public"."Feed"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "FeedCategory" ADD CONSTRAINT "FeedCategory_feed_id_Feed_id_fk" FOREIGN KEY ("feed_id") REFERENCES "public"."Feed"("id") ON DELETE cascade ON UPDATE no action;