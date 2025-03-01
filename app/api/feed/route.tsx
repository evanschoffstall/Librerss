import { PrismaClient } from "@prisma/client";
import axios from "axios";
import { NextRequest, NextResponse } from "next/server";
import Parser from "rss-parser";

const prisma = new PrismaClient();
const parser = new Parser();

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const feedUrl = url.searchParams.get("url");

  if (!feedUrl) {
    return NextResponse.json({ error: "Missing feed URL" }, { status: 400 });
  }

  const feed = await prisma.feed.findUnique({
    where: { url: feedUrl },
    include: { articles: true },
  });

  let shouldFetch = true;
  if (feed) {
    const lastFetched = feed.last_fetched;
    const diffMinutes =
      (new Date().getTime() - new Date(lastFetched).getTime()) / 60000;
    if (diffMinutes < 15) {
      shouldFetch = false;
    }
  } else {
    await prisma.feed.create({
      data: { url: feedUrl },
    });
  }

  if (shouldFetch) {
    const feedResponse = await axios.get(feedUrl);
    const feedResponseParsed = await parser.parseString(feedResponse.data);

    for (const item of feedResponseParsed.items) {
      const { title, link, isoDate, content } = item;
      await prisma.article.upsert({
        where: { link },
        update: {
          title,
          publication_date: isoDate ? new Date(isoDate) : new Date(),
          content,
          last_checked: new Date(),
        },
        create: {
          title,
          link,
          publication_date: isoDate ? new Date(isoDate) : new Date(),
          content,
          feed: { connect: { id: feed.id } },
          last_checked: new Date(),
        },
      });
    }

    await prisma.feed.update({
      where: { url: feedUrl },
      data: { last_fetched: new Date() },
    });
  }

  const articles = await prisma.article.findMany({
    where: { feed_id: feed.id },
    select: { title: true, link: true, content: true },
    orderBy: { publication_date: "desc" },
  });

  return NextResponse.json(articles);
}

export async function POST(request: NextRequest) {
  const data = await request.json();

  const newFeed = await prisma.feed.create({
    data,
  });

  return NextResponse.json(newFeed);
}
