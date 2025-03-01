import { PrismaClient } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";

const prisma = new PrismaClient();

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const articleId = parseInt(params.id);

  const article = await prisma.article.findUnique({
    where: { id: articleId },
  });

  if (!article) {
    return NextResponse.json({ error: "Article not found" }, { status: 404 });
  }

  return NextResponse.json(article);
}

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  const articleId = parseInt(params.id);
  const data = await request.json();

  const updatedArticle = await prisma.article.update({
    where: { id: articleId },
    data,
  });

  return NextResponse.json(updatedArticle);
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const articleId = parseInt(params.id);

  await prisma.article.delete({
    where: { id: articleId },
  });

  return NextResponse.json({ message: "Article deleted" });
}
