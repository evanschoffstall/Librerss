import type { AxiosError, AxiosResponse } from "axios";

import { describe, expect, test } from "bun:test";

import {
  detectResponseCompatibilitySignal,
  detectSourceCompatibilitySignal,
  pickDiagnosticHeaders,
} from "@/lib/fetch";

function createAxiosError(
  status: number,
  data?: string,
  headers?: Record<string, unknown>,
): AxiosError {
  const error = new Error(
    `Request failed with status code ${status}`,
  ) as AxiosError;
  error.isAxiosError = true;
  error.response = {
    config: {} as AxiosResponse["config"],
    data,
    headers,
    status,
    statusText: status === 429 ? "Too Many Requests" : "Forbidden",
  } as AxiosResponse;
  return error;
}

function isAxiosError<T = unknown, D = unknown>(
  payload: unknown,
): payload is AxiosError<T, D> {
  return Boolean(
    payload &&
      typeof payload === "object" &&
      "isAxiosError" in payload &&
      (payload as AxiosError).isAxiosError === true,
  );
}

describe("fetch/compatibility-signal", () => {
  test("detects DataDome responses and keeps challenge cookies", () => {
    const result = detectResponseCompatibilitySignal(
      403,
      {
        "set-cookie": [
          "datadome=abc; Path=/; Secure",
          "session=123; Path=/; HttpOnly",
        ],
        "x-datadome": "protected",
      },
      "<html>captcha-delivery.datadome.co</html>",
    );

    expect(result.retryable).toBe(false);
    expect(result.signal.detected).toBe(true);
    if (result.signal.detected) {
      expect(result.signal.provider).toBe("DataDome");
      expect(result.signal.challengeCookies).toEqual([
        "datadome=abc; Path=/; Secure",
        "session=123; Path=/; HttpOnly",
      ]);
    }
  });

  test("detects PerimeterX from response headers", () => {
    const result = detectResponseCompatibilitySignal(
      403,
      { "x-px-block": "1" },
      "<html>blocked</html>",
    );

    expect(result.retryable).toBe(false);
    expect(result.signal).toEqual({
      challengeCookies: [],
      detected: true,
      provider: "PerimeterX",
    });
  });

  test("detects Cloudflare challenge bodies", () => {
    const result = detectResponseCompatibilitySignal(
      403,
      { "set-cookie": "cf_clearance=abc; Path=/; Secure" },
      "<html><body>Attention Required! | Cloudflare /cdn-cgi/challenge-platform</body></html>",
    );

    expect(result.retryable).toBe(false);
    expect(result.signal.detected).toBe(true);
    if (result.signal.detected) {
      expect(result.signal.provider).toBe("Cloudflare");
      expect(result.signal.challengeCookies).toEqual([
        "cf_clearance=abc; Path=/; Secure",
      ]);
    }
  });

  test("detects reCAPTCHA challenge bodies", () => {
    const result = detectResponseCompatibilitySignal(
      403,
      {},
      '<div class="g-recaptcha">I\'m not a robot</div>',
    );

    expect(result.retryable).toBe(false);
    expect(result.signal).toEqual({
      challengeCookies: [],
      detected: true,
      provider: "reCAPTCHA",
    });
  });

  test("keeps generic 403 and 429 responses retryable when no challenge marker exists", () => {
    const generic403 = detectResponseCompatibilitySignal(
      403,
      { server: "nginx" },
      "temporarily blocked",
    );
    const generic429 = detectResponseCompatibilitySignal(
      429,
      { "retry-after": "120" },
      "too many requests",
    );

    expect(generic403).toEqual({ retryable: true, signal: { detected: false } });
    expect(generic429).toEqual({ retryable: true, signal: { detected: false } });
  });

  test("detectSourceCompatibilitySignal classifies axios-style errors", () => {
    const result = detectSourceCompatibilitySignal(
      createAxiosError(403, "<html>px-captcha challenge</html>", {}),
      isAxiosError,
    );

    expect(result.retryable).toBe(false);
    expect(result.signal.detected).toBe(true);
    if (result.signal.detected) {
      expect(result.signal.provider).toBe("PerimeterX");
    }
  });

  test("pickDiagnosticHeaders keeps challenge diagnostics and counts cookies", () => {
    expect(
      pickDiagnosticHeaders({
        "cf-ray": "abc123",
        ignored: "nope",
        server: "cloudflare",
        "set-cookie": ["a=1", "b=2"],
        "x-px-uuid": "token-1",
      }),
    ).toEqual({
      "cf-ray": "abc123",
      server: "cloudflare",
      "set-cookie-count": 2,
      "x-px-uuid": "token-1",
    });
  });
});