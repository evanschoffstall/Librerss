import { getUserFromRequest } from "@/src/lib/auth/session";
import { getDb } from "@/src/lib/db/db";
import { articles } from "@/src/lib/db/schema";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function parseDateInput(value: unknown): Date | null {
  if (typeof value !== "string") {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function isAllowedUrl(raw: string): boolean {
  try {
    const { protocol } = new URL(raw);
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

export async function GET(request: NextRequest) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const db = getDb();
    const allArticles = await db.select().from(articles);

    return NextResponse.json(allArticles);
  } catch (error) {
    console.error("Articles GET error:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let data: unknown;
    try {
      data = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const payload = data as Record<string, unknown>;
    const title = typeof payload.title === "string" ? payload.title.trim() : "";
    const link = typeof payload.link === "string" ? payload.link.trim() : "";
    const content = typeof payload.content === "string" ? payload.content : "";
    const feedId = Number(payload.feed_id);

    if (!title) {
      return NextResponse.json({ error: "Title is required" }, { status: 400 });
    }

    if (!link || !isAllowedUrl(link)) {
      return NextResponse.json(
        { error: "A valid article link is required" },
        { status: 400 },
      );
    }

    if (!Number.isInteger(feedId) || feedId <= 0) {
      return NextResponse.json(
        { error: "A valid feed_id is required" },
        { status: 400 },
      );
    }

    const publicationDate = payload.publication_date
      ? parseDateInput(payload.publication_date)
      : new Date();
    const lastChecked = payload.last_checked
      ? parseDateInput(payload.last_checked)
      : new Date();

    if (!publicationDate || !lastChecked) {
      return NextResponse.json(
        { error: "publication_date and last_checked must be valid ISO dates" },
        { status: 400 },
      );
    }

    const db = getDb();
    const [newArticle] = await db
      .insert(articles)
      .values({
        title,
        link,
        publicationDate,
        content,
        feedId,
        lastChecked,
      })
      .returning();

    return NextResponse.json(newArticle);
  } catch (error) {
    console.error("Articles POST error:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
