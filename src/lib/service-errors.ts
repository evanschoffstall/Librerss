/**
 * Implements the server service error.
 */
export class ServerServiceError extends Error {
  /**
   * Creates a service error with HTTP status metadata for route handlers.
   * @param message - Human-readable error message for logs and responses.
   * @param status - HTTP status code that should be returned to the client.
   * @param reason - Optional machine-readable failure reason.
   */
  constructor(
    message: string,
    public readonly status: number,
    public readonly reason?: string,
  ) {
    super(message);
    this.name = "ServerServiceError";
  }
}
