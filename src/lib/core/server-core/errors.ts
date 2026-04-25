export class FeedSourceNotFoundError extends Error {
  /**
   * Creates an error for feed URLs that do not map to any configured source.
   * @param feedUrl - Feed URL that could not be resolved.
   */
  constructor(feedUrl: string) {
    super(`Feed source not found for URL: ${feedUrl}`);
    this.name = "FeedSourceNotFoundError";
  }
}

export class UpstreamFeedError extends Error {
  /**
   * Creates an error for upstream feed fetch failures.
   * @param feedUrl - Feed URL whose upstream fetch failed.
   * @param cause - Failure reason returned by the upstream fetch path.
   */
  constructor(feedUrl: string, cause: string) {
    super(`Upstream feed fetch failed for ${feedUrl}: ${cause}`);
    this.name = "UpstreamFeedError";
  }
}

/**
 * Return whether is feed source not found error.
 * @param error - The error.
 * @returns Whether is feed source not found error.
 */
export function isFeedSourceNotFoundError(
  error: unknown,
): error is FeedSourceNotFoundError {
  return (
    error instanceof FeedSourceNotFoundError ||
    (error instanceof Error && error.name === "FeedSourceNotFoundError")
  );
}

/**
 * Return whether is upstream feed error.
 * @param error - The error.
 * @returns Whether is upstream feed error.
 */
export function isUpstreamFeedError(
  error: unknown,
): error is UpstreamFeedError {
  return (
    error instanceof UpstreamFeedError ||
    (error instanceof Error && error.name === "UpstreamFeedError")
  );
}
