/**
 * Process the to error.
 * @param error - The error.
 * @returns The to error.
 */
export function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

/**
 * Process the to error message.
 * @param error - The error.
 * @returns The to error message.
 */
export function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
