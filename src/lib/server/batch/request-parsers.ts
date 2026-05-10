import { NextResponse } from "next/server";

/**
 * Parse an explicit dashboard article-window limit.
 *
 * The infinite-scroll client owns the page size and advances this value one
 * page at a time. Large libraries can legitimately request windows above the
 * default no-limit fallback, so this parser validates shape and finiteness but
 * does not clamp explicit values to `MAX_ALL_ARTICLES_LIMIT`.
 * @param value - Raw request-body value supplied as `articleLimit`.
 * @returns The validated article-window limit, `undefined` when omitted, or a
 *   `400` response when the value cannot be used as a SQL `LIMIT`.
 */
export function parseArticleLimit(
  value: unknown,
): number | Response | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
    return NextResponse.json(
      {
        error: "articleLimit must be a positive safe integer when provided",
      },
      { status: 400 },
    );
  }

  return value;
}

/**
 * Parse the force-resolve-upstream flag.
 * @param value - Raw request-body value supplied as `forceResolveUpstream`.
 * @returns The normalized boolean flag or a `400` response when the value is invalid.
 */
export function parseForceResolveUpstream(value: unknown): boolean | Response {
  if (value === undefined) {
    return false;
  }

  if (typeof value !== "boolean") {
    return NextResponse.json(
      {
        error: "forceResolveUpstream must be a boolean",
      },
      { status: 400 },
    );
  }

  return value;
}
