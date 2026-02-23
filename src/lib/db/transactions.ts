export async function withTransaction<T>(
  operation: () => Promise<T>,
): Promise<T> {
  return operation();
}
