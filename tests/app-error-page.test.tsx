import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

import * as realLibModule from "@/lib";
import {
  consumeFatalServerError,
  recordFatalServerError,
  resetFatalServerErrorsForTesting,
} from "@/lib/server";

let pageImportVersion = 0;

/**
 * Create a partial `@/lib` mock with a replaceable logger.
 *
 * @param loggerOverrides - The logger methods to override for a specific test.
 * @returns The mocked `@/lib` module surface.
 */
function createLibMock(
  loggerOverrides: Partial<typeof realLibModule.logger>,
): typeof realLibModule {
  return {
    ...realLibModule,
    logger: Object.assign(
      Object.create(realLibModule.logger),
      realLibModule.logger,
      loggerOverrides,
    ),
  };
}

/**
 * Import the `/error` page with a fresh module identity.
 *
 * @returns The freshly imported `/error` page module.
 */
async function loadServerErrorPage() {
  pageImportVersion += 1;
  return import(`@/app/error/page?page-test=${pageImportVersion}`);
}

beforeEach(() => {
  mock.restore();
  resetFatalServerErrorsForTesting();
});

afterEach(() => {
  mock.restore();
  resetFatalServerErrorsForTesting();
});

describe("server error page", () => {
  test("logs direct /error navigation as a warning without inventing a backend error", async () => {
    const logError = mock(() => undefined);
    const logWarn = mock(() => undefined);

    mock.module("@/lib", () =>
      createLibMock({ error: logError, warn: logWarn }),
    );

    const { default: ServerErrorPage } = await loadServerErrorPage();
    await ServerErrorPage({ searchParams: Promise.resolve({}) });

    expect(logError).not.toHaveBeenCalled();
    expect(logWarn).toHaveBeenCalledWith("Server error page rendered", {
      correlationId: "direct",
    });
  });

  test("logs the real stored backend Error when /error renders with a matching correlation ID", async () => {
    const backendError = new Error("database connection failed");
    const fatalError = recordFatalServerError(
      "api/auth/dev-login",
      backendError,
    );
    const logError = mock(() => undefined);
    const logWarn = mock(() => undefined);

    mock.module("@/lib", () =>
      createLibMock({ error: logError, warn: logWarn }),
    );

    const { default: ServerErrorPage } = await loadServerErrorPage();
    await ServerErrorPage({
      searchParams: Promise.resolve({ cid: fatalError.correlationId }),
    });

    expect(logWarn).not.toHaveBeenCalled();
    expect(logError).toHaveBeenCalledWith(
      "Server error page rendered after fatal backend error",
      {
        correlationId: fatalError.correlationId,
        error: backendError,
        source: "api/auth/dev-login",
      },
    );
    expect(consumeFatalServerError(fatalError.correlationId)).toBeNull();
  });
});
