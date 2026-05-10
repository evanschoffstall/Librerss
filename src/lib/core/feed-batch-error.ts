/**
 * Describes one per-feed upstream error surfaced through the batch refresh pipeline.
 *
 * The dashboard toast needs both the human-readable message and, when the
 * upstream returned one, the HTTP status code that explains why one feed failed
 * while its siblings may still have refreshed successfully.
 */
export interface BatchFeedError {
  message: string;
  statusCode?: number;
}
