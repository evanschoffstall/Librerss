/**
 * Classified feed batch error with a user-facing toast title and description.
 *
 * Separating classification from presentation lets callers decide whether to
 * show the toast at all (e.g. Silent background refreshes).
 */
interface FeedBatchErrorToast {
  description: string;
  title: string;
}

/**
 * Classifies an error from a feed batch request into a user-actionable toast.
 *
 * The classifier duck-types the error shape to avoid coupling the dashboard
 * service layer to a specific HTTP client implementation.
 * @param error
 */
export function classifyFeedBatchError(error: unknown): FeedBatchErrorToast {
  const status = extractHttpStatus(error);
  const code = extractErrorCode(error);
  const reason = extractErrorReason(error);

  if (status === 401) {
    return {
      description: "Please sign in again to continue.",
      title: "Your session has expired.",
    };
  }

  if (status === 429) {
    return {
      description: "Please wait a moment before refreshing again.",
      title: "Too many requests.",
    };
  }

  if (reason === "proxy-password-unreadable") {
    return {
      description:
        "Re-enter your proxy password in Settings to restore feed access.",
      title: "Proxy credentials unavailable.",
    };
  }

  if (
    code === "ECONNREFUSED" ||
    code === "ECONNRESET" ||
    code === "ENOTFOUND" ||
    code === "ERR_NETWORK"
  ) {
    return {
      description: "Check your connection and try again.",
      title: "Network error.",
    };
  }

  if (error instanceof Error && error.message === "Request timeout") {
    return {
      description: "The server took too long to respond. Try again shortly.",
      title: "Request timed out.",
    };
  }

  return {
    description: "Please try refreshing the selected source again.",
    title: "Unable to load this feed right now.",
  };
}

/**
 * Recognizes expected request-cancellation variants from browser aborts and
 * TanStack Query internals so overlapping pagination requests do not surface
 * as user-visible failures.
 * @param error
 */
export function isCanceledBatchRequest(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const errorName =
    "name" in error && typeof error.name === "string" ? error.name : null;

  return (
    errorName === "AbortError" ||
    errorName === "CanceledError" ||
    errorName === "CancelledError"
  );
}

/**
 * Returns whether a batch failure is already classified and user-actionable,
 * so callers can avoid duplicating noisy console errors for expected states.
 * @param error
 */
export function isHandledFeedBatchError(error: unknown): boolean {
  const status = extractHttpStatus(error);
  const reason = extractErrorReason(error);

  return (
    status === 401 ||
    status === 429 ||
    status === 504 ||
    reason === "proxy-password-unreadable" ||
    isCanceledBatchRequest(error)
  );
}

/**
 * @param error
 */
function extractErrorCode(error: unknown): string | undefined {
  return readStringProperty(error, "code");
}

/**
 * @param error
 */
function extractErrorReason(error: unknown): string | undefined {
  return readStringProperty(extractHttpResponseData(error), "reason");
}

/**
 * @param error
 */
function extractHttpResponse(error: unknown): null | Record<string, unknown> {
  if (
    error &&
    typeof error === "object" &&
    "response" in error &&
    error.response &&
    typeof error.response === "object"
  ) {
    return error.response as Record<string, unknown>;
  }

  return null;
}

/**
 * @param error
 */
function extractHttpResponseData(
  error: unknown,
): null | Record<string, unknown> {
  const response = extractHttpResponse(error);

  if (
    response &&
    "data" in response &&
    response.data &&
    typeof response.data === "object"
  ) {
    return response.data as Record<string, unknown>;
  }

  return null;
}

/**
 * @param error
 */
function extractHttpStatus(error: unknown): number | undefined {
  const response = extractHttpResponse(error);

  if (response && "status" in response && typeof response.status === "number") {
    return response.status;
  }

  return undefined;
}

/**
 * @param value
 * @param key
 */
function readStringProperty(value: unknown, key: string): string | undefined {
  if (value && typeof value === "object" && key in value) {
    const candidate = value[key as keyof typeof value];

    if (typeof candidate === "string") {
      return candidate;
    }
  }

  return undefined;
}
