import { describe, expect, test } from "bun:test";

import {
  detectResponseCompatibilitySignal,
  pickDiagnosticHeaders,
} from "@/lib/fetch";

describe("fetch/compatibility-signal", () => {
  test("treats non-challenge statuses as non-retryable and undetected", () => {
    expect(
      detectResponseCompatibilitySignal(200, { server: "nginx" }, "ok"),
    ).toEqual({ retryable: false, signal: { detected: false } });
  });

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

  test("detects Akamai challenge bodies returned with HTTP 200", () => {
    const result = detectResponseCompatibilitySignal(
      200,
      { "content-type": "text/html" },
      `
        <!doctype html>
        <html>
          <body>
            <div id="sec-if-cpt-container" role="main" style="display: none">
              <div class="scf-akamai-logo-sec-abc">
                <p>Powered and protected by</p>
              </div>
            </div>
          </body>
        </html>
      `,
    );

    expect(result.retryable).toBe(false);
    expect(result.signal).toEqual({
      challengeCookies: [],
      detected: true,
      provider: "Akamai",
    });
  });

  test("does not reject normal HTTP 200 article pages that embed challenge scripts", () => {
    const result = detectResponseCompatibilitySignal(
      200,
      { "content-type": "text/html" },
      `
        <html>
          <body>
            <article>
              <p>This article includes a contact form script but still has readable publisher content.</p>
              <p>The extraction pipeline must not treat every embedded challenge script as a blocked response.</p>
            </article>
            <script src="https://www.google.com/recaptcha/api.js"></script>
          </body>
        </html>
      `,
    );

    expect(result).toEqual({ retryable: false, signal: { detected: false } });
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

    expect(generic403).toEqual({
      retryable: true,
      signal: { detected: false },
    });
    expect(generic429).toEqual({
      retryable: true,
      signal: { detected: false },
    });
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
