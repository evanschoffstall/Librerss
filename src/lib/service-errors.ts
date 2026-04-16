export class ServerServiceError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly reason?: string,
  ) {
    super(message);
    this.name = "ServerServiceError";
  }
}
