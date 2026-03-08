import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

beforeEach(() => mock.restore());
afterEach(() => mock.restore());
describe("lib/auth/csrf additional coverage", () => {
  test("requireSameOrigin allows same-origin requests with origin header", async () => {
    const { requireSameOrigin } = await import("@/lib/auth/csrf");

    const request = new Request("https://example.com/api/test", {
      method: "POST",
      headers: {
        host: "example.com",
        origin: "https://example.com",
      },
    });

    const result = requireSameOrigin(request);
    expect(result).toBeNull();
  });

  test("requireSameOrigin blocks cross-origin requests with origin header", async () => {
    const { requireSameOrigin } = await import("@/lib/auth/csrf");

    const request = new Request("https://example.com/api/test", {
      method: "POST",
      headers: {
        host: "example.com",
        origin: "https://evil.com",
      },
    });

    const result = requireSameOrigin(request);
    expect(result).not.toBeNull();
    if (result) {
      expect(result.status).toBe(403);
    }
  });

  test("requireSameOrigin allows same-origin requests with referer header", async () => {
    const { requireSameOrigin } = await import("@/lib/auth/csrf");

    const request = new Request("https://example.com/api/test", {
      method: "POST",
      headers: {
        host: "example.com",
        referer: "https://example.com/page",
      },
    });

    const result = requireSameOrigin(request);
    expect(result).toBeNull();
  });

  test("requireSameOrigin blocks cross-origin requests with referer header", async () => {
    const { requireSameOrigin } = await import("@/lib/auth/csrf");

    const request = new Request("https://example.com/api/test", {
      method: "POST",
      headers: {
        host: "example.com",
        referer: "https://evil.com/page",
      },
    });

    const result = requireSameOrigin(request);
    expect(result).not.toBeNull();
  });

  test("requireSameOrigin blocks when Sec-Fetch-Site indicates cross-site", async () => {
    const { requireSameOrigin } = await import("@/lib/auth/csrf");

    const request = new Request("https://example.com/api/test", {
      method: "POST",
      headers: {
        host: "example.com",
        "sec-fetch-site": "cross-site",
      },
    });

    const result = requireSameOrigin(request);
    expect(result).not.toBeNull();
  });

  test("requireSameOrigin allows when Sec-Fetch-Site is same-origin", async () => {
    const { requireSameOrigin } = await import("@/lib/auth/csrf");

    const request = new Request("https://example.com/api/test", {
      method: "POST",
      headers: {
        host: "example.com",
        "sec-fetch-site": "same-origin",
      },
    });

    const result = requireSameOrigin(request);
    expect(result).toBeNull();
  });

  test("requireSameOrigin blocks when host header is missing", async () => {
    const { requireSameOrigin } = await import("@/lib/auth/csrf");

    const request = new Request("https://example.com/api/test", {
      method: "POST",
    });

    const result = requireSameOrigin(request);
    expect(result).not.toBeNull();
  });

  test("requireSameOrigin handles malformed origin gracefully", async () => {
    const { requireSameOrigin } = await import("@/lib/auth/csrf");

    const request = new Request("https://example.com/api/test", {
      method: "POST",
      headers: {
        host: "example.com",
        origin: "not-a-valid-url",
      },
    });

    const result = requireSameOrigin(request);
    expect(result).not.toBeNull();
  });
});
