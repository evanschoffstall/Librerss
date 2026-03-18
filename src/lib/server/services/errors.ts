/**
 * Transport-agnostic error type for server-side service operations.
 *
 * Route handlers catch these and map to HTTP responses; future GReader API
 * handlers map to their own wire format.
 */
export class ServiceError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly reason?: string,
  ) {
    super(message);
    this.name = "ServiceError";
  }
}
