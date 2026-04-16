import { type NextRequest } from "next/server";

import { type jsonError } from "@/lib/api/http";
import {
  type isFeedSourceNotFoundError,
  type isUpstreamFeedError,
} from "@/lib/core/server";
import { HttpCloakUpstreamError, pickDiagnosticHeaders } from "@/lib/fetch";
import { redactUrlForLogs, type toErrorMessage } from "@/lib/utils";

interface FeedAttemptContext {
  feedAttemptId?: string;
  requestId?: null | string;
  verboseLoggingEnabled?: boolean;
}

interface FeedReadErrorResponderOptions {
  error: unknown;
  feedAttemptContext: FeedAttemptContext;
  isSourceNotFound: typeof isFeedSourceNotFoundError;
  isUpstreamError: typeof isUpstreamFeedError;
  jsonError: typeof jsonError;
  request: NextRequest;
  requestedFeedUrl: (request: NextRequest) => null | string;
  toErrorMessage: typeof toErrorMessage;
  upstreamFeedErrorMessage: string;
  warn: FeedRouteWarn;
}

type FeedRouteWarn = (
  message: string,
  context?: Record<string, unknown>,
) => void;

/**
 * Maps feed read failures to route responses while preserving diagnostic logs.
 *
 * The route owns authentication and dependency wiring; this helper owns the
 * upstream failure matrix so the route file stays below complexity thresholds.
 */
export function respondToFeedReadError({
  error,
  feedAttemptContext,
  isSourceNotFound,
  isUpstreamError,
  jsonError: toJsonError,
  request,
  requestedFeedUrl,
  toErrorMessage,
  upstreamFeedErrorMessage,
  warn,
}: FeedReadErrorResponderOptions): null | Response {
  const requestedUrl = requestedFeedUrl(request);
  const safeUrl = requestedUrl ? redactUrlForLogs(requestedUrl) : null;
  const urlSuffix = safeUrl ? ` for ${safeUrl}` : "";
  const verboseLoggingEnabled =
    feedAttemptContext.verboseLoggingEnabled ?? false;
  const feedAttemptId = feedAttemptContext.feedAttemptId;
  const requestId = feedAttemptContext.requestId ?? null;

  if (isSourceNotFound(error)) {
    return toJsonError("Feed source not found", 404);
  }

  if (isUpstreamError(error)) {
    warn(
      `Returning 502 Bad Gateway — upstream feed fetch failed${urlSuffix}: ${toErrorMessage(error)}`,
      {
        feedAttemptId,
        requestId,
        url: safeUrl,
      },
    );
    return toJsonError(upstreamFeedErrorMessage, 502);
  }

  if (error instanceof HttpCloakUpstreamError) {
    warn(
      `Returning 502 Bad Gateway — upstream feed HTTPCloak request failed${urlSuffix}: ${toErrorMessage(error)}`,
      {
        feedAttemptId,
        requestId,
        responseHeaders: pickDiagnosticHeaders(error.responseHeaders),
        statusCode: error.statusCode,
        url: safeUrl,
        ...(verboseLoggingEnabled
          ? {
              redirectHop: error.redirectHop,
              requestHeaders: error.requestHeaders,
            }
          : {}),
      },
    );
    return toJsonError(upstreamFeedErrorMessage, 502);
  }

  return null;
}
