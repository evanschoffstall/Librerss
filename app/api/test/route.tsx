import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const requestUrl = request.url;

  return NextResponse.json({
    message: "Testing response from the API",
    request: requestUrl,
  });
}

export async function HEAD() { }
export async function POST() { }
export async function PUT() { }
export async function DELETE() { }
export async function PATCH() { }
export async function OPTIONS() { }
