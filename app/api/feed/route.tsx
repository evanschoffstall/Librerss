import axios from "axios";
import Parser from "rss-parser";
import { NextRequest, NextResponse } from "next/server";

const parser = new Parser();

export async function GET(request: NextRequest) {
  const feedUrl = "https://feeds.bbci.co.uk/news/world/rss.xml";
  try {
    const response = await axios.get(feedUrl);
    const feed = await parser.parseString(response.data);
    return NextResponse.json(feed);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed to fetch feed" });
  }
}

export async function HEAD(request: NextRequest) {}
export async function POST(request: NextRequest) {}
export async function PUT(request: NextRequest) {}
export async function DELETE(request: NextRequest) {}
export async function PATCH(request: NextRequest) {}
export async function OPTIONS(request: NextRequest) {}
