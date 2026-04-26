import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import {
  consumeFatalServerError,
  recordFatalServerError,
  resetFatalServerErrorsForTesting,
} from "@/lib/server";

beforeEach(() => {
  resetFatalServerErrorsForTesting();
});

afterEach(() => {
  resetFatalServerErrorsForTesting();
});

describe("fatal server error registry", () => {
  test("records the real Error object and consumes it exactly once", () => {
    const backendError = new Error("database connection failed");
    const record = recordFatalServerError("api/auth/dev-login", backendError);

    expect(record.correlationId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u,
    );
    expect(record.error).toBe(backendError);
    expect(record.source).toBe("api/auth/dev-login");

    expect(consumeFatalServerError(record.correlationId)).toBe(record);
    expect(consumeFatalServerError(record.correlationId)).toBeNull();
  });

  test("normalizes non-Error throws before storing the fatal redirect record", () => {
    const record = recordFatalServerError(
      "api/auth/dev-login",
      "database connection failed",
    );

    expect(record.error).toBeInstanceOf(Error);
    expect(record.error.message).toBe("database connection failed");
    expect(consumeFatalServerError(record.correlationId)?.error).toBe(
      record.error,
    );
  });

  test("rejects malformed correlation IDs without consuming valid records", () => {
    const record = recordFatalServerError(
      "api/auth/dev-login",
      new Error("database connection failed"),
    );

    expect(consumeFatalServerError("not-a-valid-correlation-id")).toBeNull();
    expect(consumeFatalServerError(undefined)).toBeNull();
    expect(consumeFatalServerError(record.correlationId)).toBe(record);
  });
});
