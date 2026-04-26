import { toError } from "@/lib/utils";

const FATAL_SERVER_ERROR_TTL_MS = 5 * 60 * 1000;
const MAX_FATAL_SERVER_ERROR_RECORDS = 100;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

/**
 * Describes a fatal server error that has been captured before redirecting to
 * the navigable `/error` page.
 *
 * The record intentionally stores the real `Error` object only in server
 * memory. The browser receives only the opaque `correlationId`, so stack traces
 * and sensitive database or platform failure details never cross into the URL
 * or rendered HTML.
 */
export interface FatalServerErrorRecord {
  correlationId: string;
  createdAt: number;
  error: Error;
  source: string;
}

declare global {
  var __librerssFatalServerErrors:
    | Map<string, FatalServerErrorRecord>
    | undefined;
}

/**
 * Consume the fatal server error associated with a redirect correlation ID.
 *
 * The operation is intentionally one-shot: once `/error` renders and emits the
 * real error to the backend console, the record is removed to avoid stale error
 * reuse and process-local memory growth.
 *
 * @param correlationId - The untrusted correlation ID read from the `/error`
 *   query string.
 * @returns The matching fatal error record, or `null` when the ID is absent,
 *   malformed, expired, already consumed, or unknown to this process.
 */
export function consumeFatalServerError(
  correlationId: string | undefined,
): FatalServerErrorRecord | null {
  pruneFatalServerErrors();

  if (!isValidFatalServerErrorCorrelationId(correlationId)) {
    return null;
  }

  const registry = getFatalServerErrorRegistry();
  const record = registry.get(correlationId);
  registry.delete(correlationId);

  return record ?? null;
}

/**
 * Record a fatal server-side exception before redirecting the user to `/error`.
 *
 * @param source - A stable source label describing the route or subsystem that
 *   caught the fatal exception.
 * @param error - The thrown value to normalize and retain as a real `Error`.
 * @returns The fatal error record that should be logged immediately and whose
 *   `correlationId` should be appended to the `/error` redirect URL.
 */
export function recordFatalServerError(
  source: string,
  error: unknown,
): FatalServerErrorRecord {
  pruneFatalServerErrors();

  const correlationId = crypto.randomUUID();
  const record = {
    correlationId,
    createdAt: Date.now(),
    error: toError(error),
    source,
  } satisfies FatalServerErrorRecord;
  getFatalServerErrorRegistry().set(correlationId, record);

  return record;
}

/**
 * Clear all captured fatal server errors for isolated test runs.
 */
export function resetFatalServerErrorsForTesting(): void {
  getFatalServerErrorRegistry().clear();
}

/**
 * Return the process-local fatal error registry shared by server bundles.
 *
 * @returns The mutable fatal server error registry.
 */
function getFatalServerErrorRegistry(): Map<string, FatalServerErrorRecord> {
  globalThis.__librerssFatalServerErrors ??= new Map();
  return globalThis.__librerssFatalServerErrors;
}

/**
 * Return whether a value is a valid fatal error correlation ID.
 *
 * @param correlationId - The untrusted correlation ID value to validate.
 * @returns Whether the value is a UUID accepted by the server registry.
 */
function isValidFatalServerErrorCorrelationId(
  correlationId: string | undefined,
): correlationId is string {
  return typeof correlationId === "string" && UUID_PATTERN.test(correlationId);
}

/**
 * Remove old records and trim the registry to a bounded size.
 *
 * The registry is a development and runtime observability bridge, not durable
 * storage. Bounded retention prevents repeated fatal redirects from growing
 * process memory without limit.
 */
function pruneFatalServerErrors(): void {
  const registry = getFatalServerErrorRegistry();
  const expiresBefore = Date.now() - FATAL_SERVER_ERROR_TTL_MS;

  for (const [correlationId, record] of registry) {
    if (record.createdAt < expiresBefore) {
      registry.delete(correlationId);
    }
  }

  while (registry.size > MAX_FATAL_SERVER_ERROR_RECORDS) {
    const oldestCorrelationId = registry.keys().next().value;

    if (!oldestCorrelationId) {
      return;
    }

    registry.delete(oldestCorrelationId);
  }
}
