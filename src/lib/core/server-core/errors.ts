export class FeedSourceNotFoundError extends Error {
  constructor(feedUrl: string) {
    super(`Feed source not found for URL: ${feedUrl}`);
    this.name = "FeedSourceNotFoundError";
  }
}

export class UpstreamFeedError extends Error {
  constructor(feedUrl: string, cause: string) {
    super(`Upstream feed fetch failed for ${feedUrl}: ${cause}`);
    this.name = "UpstreamFeedError";
  }
}

export function isFeedSourceNotFoundError(
  error: unknown,
): error is FeedSourceNotFoundError {
  return (
    error instanceof FeedSourceNotFoundError ||
    (error instanceof Error && error.name === "FeedSourceNotFoundError")
  );
}

export function isUpstreamFeedError(
  error: unknown,
): error is UpstreamFeedError {
  return (
    error instanceof UpstreamFeedError ||
    (error instanceof Error && error.name === "UpstreamFeedError")
  );
}
