import { type NextRequest } from "next/server";

import { type jsonError } from "@/lib/api/http";
import {
  type isFeedSourceNotFoundError,
  type isUpstreamFeedError,
} from "@/lib/core/server";
import { HttpCloakUpstreamError, pickDiagnosticHeaders } from "@/lib/fetch";
import { redactUrlForLogs, type toErrorMessage } from "@/lib/utils";

/**
 * Describes the feed attempt context.
 */
interface FeedAttemptContext {
  feedAttemptId?: string;
  requestId?: null | string;
  verboseLoggingEnabled?: boolean;
}

/**
 * Describes the options for feed read error responder.
 */
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

/**
 * Defines the feed route warn type.
 */
type FeedRouteWarn = (
  message: string,
  context?: Record<string, unknown>,
) => void;

/**
 * Process the respond to feed read error.
 * @param options - The options used to process the respond to feed read error.
 * @returns The respond to feed read error.
 */
export function respondToFeedReadError(
  options: FeedReadErrorResponderOptions,
): null | Response {
  const {
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
  } = options;
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
