import { PrismaClient } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";

const prisma = new PrismaClient();

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const feedId = parseInt(params.id);

  const feed = await prisma.feed.findUnique({
    where: { id: feedId },
    include: { articles: true },
  });

  if (!feed) {
    return NextResponse.json({ error: "Feed not found" }, { status: 404 });
  }

  return NextResponse.json(feed);
}

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  const feedId = parseInt(params.id);
  const data = await request.json();

  const updatedFeed = await prisma.feed.update({
    where: { id: feedId },
    data,
  });

  return NextResponse.json(updatedFeed);
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const feedId = parseInt(params.id);

  await prisma.feed.delete({
    where: { id: feedId },
  });

  return NextResponse.json({ message: "Feed deleted" });
}
