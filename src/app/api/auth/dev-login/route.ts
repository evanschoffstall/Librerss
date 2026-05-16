import type { NextRequest } from "next/server";

import { NextResponse } from "next/server";

import { logger } from "@/lib";
import {
  authenticateCredentials,
  buildDevAutoLoginFailurePath,
  DEV_AUTO_LOGIN_RETURN_TO_QUERY_KEY,
  getDevAutoLoginCredentials,
  setSessionCookie,
} from "@/lib/auth";
import { recordFatalServerError } from "@/lib/server";

const DEFAULT_RETURN_PATH = "/dashboard";

/**
 * Handle the GET request.
 * @param request - The request.
 * @returns A JSON response or error response.
 */
export async function GET(request: NextRequest) {
  try {
    const credentials = getDevAutoLoginCredentials();
    const requestOrigin = getRequestOrigin(request);

    if (!credentials) {
      return NextResponse.json({ error: "Not Found" }, { status: 404 });
    }

    const returnPath = resolveReturnPath(request);
    const result = await authenticateCredentials(
      credentials.email,
      credentials.password,
    );

    if (!result.ok) {
      logger.warn("Development auto-login failed", {
        email: credentials.email,
      });

      return NextResponse.redirect(
        new URL(buildDevAutoLoginFailurePath(returnPath), requestOrigin),
      );
    }

    logger.info("Development auto-login succeeded", {
      email: result.email,
      userId: result.userId,
    });

    const response = NextResponse.redirect(new URL(returnPath, requestOrigin));
    setSessionCookie(response, result.token);

    return response;
  } catch (error) {
    return redirectToServerErrorPage(request, error);
  }
}

/**
 * Return the request origin.
 * @param request - The request.
 * @returns The request origin.
 */
function getRequestOrigin(request: NextRequest): URL {
  const forwardedHost = request.headers.get("x-forwarded-host");
  const host = forwardedHost ?? request.headers.get("host");

  if (!host) {
    return request.nextUrl;
  }

  const forwardedProtocol = request.headers.get("x-forwarded-proto");
  const protocol =
    forwardedProtocol ?? request.nextUrl.protocol.replace(/:$/u, "");

  return new URL(`${protocol}://${host}`);
}

/**
 * Log and redirect a fatal development auto-login exception to the HTML error
 * page.
 *
 * The route is a browser navigation endpoint, so returning JSON would surface a
 * raw 500 payload to the user. The error is still captured as a real `Error`
 * in the process-local registry and is emitted again by `/error` when that page
 * renders, giving the backend console the actual stack under the same
 * correlation ID.
 *
 * @param request - The request that failed during development auto-login.
 * @param error - The thrown value that caused the fatal route failure.
 * @returns A redirect response targeting `/error` with a server correlation ID.
 */
function redirectToServerErrorPage(
  request: NextRequest,
  error: unknown,
): NextResponse {
  const fatalError = recordFatalServerError("api/auth/dev-login", error);
  logger.error("Development auto-login error", {
    correlationId: fatalError.correlationId,
    error: fatalError.error,
  });

  const errorUrl = new URL("/error", request.nextUrl);
  errorUrl.searchParams.set("cid", fatalError.correlationId);
  return NextResponse.redirect(errorUrl);
}

/**
 * Resolve the return path.
 * @param request - The request.
 * @returns The return path.
 */
function resolveReturnPath(request: NextRequest): string {
  const requestedReturnPath = request.nextUrl.searchParams.get(
    DEV_AUTO_LOGIN_RETURN_TO_QUERY_KEY,
  );

  if (
    !requestedReturnPath ||
    !requestedReturnPath.startsWith("/") ||
    requestedReturnPath.startsWith("//")
  ) {
    return DEFAULT_RETURN_PATH;
  }

  return requestedReturnPath;
}
