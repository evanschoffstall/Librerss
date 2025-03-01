import { fetchFeedData } from "@/app/shared/utils/fetchFeedData";
import { PrismaClient } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";

const prisma = new PrismaClient();

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const feedUrl = url.searchParams.get("url");

  if (!feedUrl) {
    return NextResponse.json({ error: "Missing feed URL" }, { status: 400 });
  }

  const feedData = await fetchFeedData(feedUrl);
  return NextResponse.json(feedData);
}

export async function HEAD() { }
export async function POST() { }
export async function PUT() { }
export async function DELETE() { }
export async function PATCH() { }
export async function OPTIONS() { }
