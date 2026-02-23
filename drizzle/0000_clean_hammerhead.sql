CREATE TABLE "ArticleStatus" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"article_id" integer NOT NULL,
	"is_read" boolean DEFAULT false NOT NULL,
	"is_starred" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "Article" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"link" text NOT NULL,
	"publication_date" timestamp with time zone NOT NULL,
	"content" text NOT NULL,
	"feed_id" integer NOT NULL,
	"last_checked" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "Article_link_unique" UNIQUE("link")
);
--> statement-breakpoint
CREATE TABLE "CategoryOrder" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"ordered_labels" text DEFAULT '[]' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "FeedCategory" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"feed_id" integer NOT NULL,
	"category" varchar(255) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "FeedSource" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"name" varchar(255) NOT NULL,
	"url" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "Feed" (
	"id" serial PRIMARY KEY NOT NULL,
	"url" text NOT NULL,
	"last_fetched" timestamp with time zone DEFAULT (now() - interval '1 day') NOT NULL,
	"last_fetch_error" text,
	CONSTRAINT "Feed_url_unique" UNIQUE("url")
);
--> statement-breakpoint
CREATE TABLE "Session" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "User" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" varchar(320) NOT NULL,
	"password_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "User_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "ArticleStatus" ADD CONSTRAINT "ArticleStatus_user_id_User_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."User"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ArticleStatus" ADD CONSTRAINT "ArticleStatus_article_id_Article_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."Article"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "Article" ADD CONSTRAINT "Article_feed_id_Feed_id_fk" FOREIGN KEY ("feed_id") REFERENCES "public"."Feed"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "CategoryOrder" ADD CONSTRAINT "CategoryOrder_user_id_User_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."User"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "FeedCategory" ADD CONSTRAINT "FeedCategory_user_id_User_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."User"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "FeedCategory" ADD CONSTRAINT "FeedCategory_feed_id_Feed_id_fk" FOREIGN KEY ("feed_id") REFERENCES "public"."Feed"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "FeedSource" ADD CONSTRAINT "FeedSource_user_id_User_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."User"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "Session" ADD CONSTRAINT "Session_user_id_User_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."User"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "article_status_user_article_idx" ON "ArticleStatus" USING btree ("user_id","article_id");--> statement-breakpoint
CREATE INDEX "article_status_user_read_idx" ON "ArticleStatus" USING btree ("user_id","is_read");--> statement-breakpoint
CREATE INDEX "article_status_user_starred_idx" ON "ArticleStatus" USING btree ("user_id","is_starred");--> statement-breakpoint
CREATE INDEX "article_feed_id_idx" ON "Article" USING btree ("feed_id");--> statement-breakpoint
CREATE INDEX "article_feed_id_pub_date_idx" ON "Article" USING btree ("feed_id","publication_date");--> statement-breakpoint
CREATE UNIQUE INDEX "category_order_user_idx" ON "CategoryOrder" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "feed_category_user_feed_idx" ON "FeedCategory" USING btree ("user_id","feed_id");--> statement-breakpoint
CREATE UNIQUE INDEX "feed_source_user_url_idx" ON "FeedSource" USING btree ("user_id","url");--> statement-breakpoint
CREATE UNIQUE INDEX "session_token_hash_idx" ON "Session" USING btree ("token_hash");