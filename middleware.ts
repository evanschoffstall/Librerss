import { NextRequest, NextResponse } from "next/server";

export function middleware(request: NextRequest) {
  try {
    const hostname = new URL(request.url).hostname;
    const subdomain = hostname.split(".")[0];
    //const subdomain = hostname.match(/^([^.]+)\./)?.[1];

    switch (subdomain) {
      case "www":
        return NextResponse.next();
      case "app":
        return NextResponse.rewrite(
          new URL(`/app${request.nextUrl.pathname}`, request.url)
        );
    }
  } catch (e) {
    console.error(e);
  }

  return NextResponse.next();
}
