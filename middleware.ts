import { NextRequest, NextResponse } from "next/server";

export function middleware(request: NextRequest) {
  return NextResponse.next();
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

  if (
    !request.nextUrl.pathname.startsWith("/_next/") &&
    request.nextUrl.pathname.startsWith("/")
  ) {
    return NextResponse.rewrite(
      new URL(`/landing${request.nextUrl.pathname}`, request.url)
    );
  }

  return NextResponse.rewrite(
    new URL(`/landing${request.nextUrl.pathname}`, request.url)
  );
}
