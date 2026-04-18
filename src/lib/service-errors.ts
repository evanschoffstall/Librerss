export class ServerServiceError extends Error {
  /**
   * @param message
   * @param status
   * @param reason
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
