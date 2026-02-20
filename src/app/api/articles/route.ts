import { db } from "@/src/lib/db/db";
import { articles } from "@/src/lib/db/schema";
import { NextRequest, NextResponse } from "next/server";

export async function GET() {
  const allArticles = await db.select().from(articles);

  return NextResponse.json(allArticles);
}

export async function POST(request: NextRequest) {
  const data = await request.json();

  const [newArticle] = await db
    .insert(articles)
    .values({
      title: data.title,
      link: data.link,
      publicationDate: data.publication_date
        ? new Date(data.publication_date)
        : new Date(),
      content: data.content || "",
      feedId: data.feed_id,
      lastChecked: data.last_checked ? new Date(data.last_checked) : new Date(),
    })
    .returning();

  return NextResponse.json(newArticle);
}
