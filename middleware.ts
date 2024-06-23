import { NextRequest, NextResponse } from "next/server";
import { env } from "process";

/* 
Middleware that routes 

DEVELOPMENT:
N/A

PRODUCTION:
app.domain.com -> domain.com/app
www.domain.com -> domain.com/landing
domain.com -> domain.com/landing

*/
export function middleware(request: NextRequest) {
  if (process.env.NODE_ENV === "development") {
    return NextResponse.next(); // No middleware routing
  } else {
    try {
      const hostname = new URL(request.url).hostname;
      const subdomain = hostname.split(".")[0];
      //const subdomain = hostname.match(/^([^.]+)\./)?.[1];

      switch (subdomain) {
        case "www":
          return NextResponse.rewrite(
            new URL(`/landing${request.nextUrl.pathname}`, request.url)
          );
        case "app":
          return NextResponse.rewrite(
            new URL(`/app${request.nextUrl.pathname}`, request.url)
          );
      }
    } catch (e) {
      console.error(e);
    }

    // FIXME: I think this needs to be in switch or above switch in a different way
    // The point is that /_next/ can't get rewritten as those are assets
    if (
      !request.nextUrl.pathname.startsWith("/_next/") &&
      request.nextUrl.pathname.startsWith("/")
    ) {
      return NextResponse.rewrite(
        new URL(`/landing${request.nextUrl.pathname}`, request.url)
      );
    }

    return NextResponse.next();
  }
}
