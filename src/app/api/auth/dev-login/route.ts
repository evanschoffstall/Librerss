import { NextRequest, NextResponse } from "next/server";

import { logger } from "@/lib";
import {
  authenticateCredentials,
  buildDevAutoLoginFailurePath,
  DEV_AUTO_LOGIN_RETURN_TO_QUERY_KEY,
  getDevAutoLoginCredentials,
  setSessionCookie,
} from "@/lib/auth";
import { logAndRespondError } from "@/lib/server";

const DEFAULT_RETURN_PATH = "/dashboard";

/**
 * Issues a normal session cookie using the development-only env credentials.
 *
 * The route intentionally accepts only same-origin relative return paths so it
 * cannot be turned into an open redirect.
 * @param request
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
      const warn =
        typeof logger.warn === "function"
          ? logger.warn.bind(logger)
          : undefined;
      warn?.("Development auto-login failed", { email: credentials.email });

      return NextResponse.redirect(
        new URL(buildDevAutoLoginFailurePath(returnPath), requestOrigin),
      );
    }

    const info =
      typeof logger.info === "function" ? logger.info.bind(logger) : undefined;
    info?.("Development auto-login succeeded", {
      email: result.email,
      userId: result.userId,
    });

    const response = NextResponse.redirect(new URL(returnPath, requestOrigin));
    setSessionCookie(response, result.token);

    return response;
  } catch (error) {
    return logAndRespondError("Development auto-login error", error);
  }
}

/**
 * Builds the active request origin from forwarding headers so redirects stay on
 * the browser-facing host even when Next.js resolves `request.url` to `0.0.0.0`.
 * @param request
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
 * Resolves a safe, same-origin relative return path for the redirect.
 * @param request
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
