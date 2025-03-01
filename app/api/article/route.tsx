import { PrismaClient } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";

const prisma = new PrismaClient();

export async function GET() {
  const articles = await prisma.article.findMany();

  return NextResponse.json(articles);
}

export async function POST(request: NextRequest) {
  const data = await request.json();

  const newArticle = await prisma.article.create({
    data,
  });

  return NextResponse.json(newArticle);
}
