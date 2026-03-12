import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

import { requireSameOrigin } from "@/lib/auth/csrf";

beforeEach(() => mock.restore());
afterEach(() => mock.restore());
describe("lib/auth/csrf additional coverage", () => {
  test("requireSameOrigin allows same-origin requests with origin header", async () => {
    const { requireSameOrigin } = await import("@/lib/auth/csrf");

    const request = new Request("https://example.com/api/test", {
      headers: {
        host: "example.com",
        origin: "https://example.com",
      },
      method: "POST",
    });

    const result = requireSameOrigin(request);
    expect(result).toBeNull();
  });

  test("requireSameOrigin blocks cross-origin requests with origin header", async () => {
    const { requireSameOrigin } = await import("@/lib/auth/csrf");

    const request = new Request("https://example.com/api/test", {
      headers: {
        host: "example.com",
        origin: "https://evil.com",
      },
      method: "POST",
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
      headers: {
        host: "example.com",
        referer: "https://example.com/page",
      },
      method: "POST",
    });

    const result = requireSameOrigin(request);
    expect(result).toBeNull();
  });

  test("requireSameOrigin blocks cross-origin requests with referer header", async () => {
    const { requireSameOrigin } = await import("@/lib/auth/csrf");

    const request = new Request("https://example.com/api/test", {
      headers: {
        host: "example.com",
        referer: "https://evil.com/page",
      },
      method: "POST",
    });

    const result = requireSameOrigin(request);
    expect(result).not.toBeNull();
  });

  test("requireSameOrigin blocks when Sec-Fetch-Site indicates cross-site", async () => {
    const { requireSameOrigin } = await import("@/lib/auth/csrf");

    const request = new Request("https://example.com/api/test", {
      headers: {
        host: "example.com",
        "sec-fetch-site": "cross-site",
      },
      method: "POST",
    });

    const result = requireSameOrigin(request);
    expect(result).not.toBeNull();
  });

  test("requireSameOrigin allows when Sec-Fetch-Site is same-origin", async () => {
    const { requireSameOrigin } = await import("@/lib/auth/csrf");

    const request = new Request("https://example.com/api/test", {
      headers: {
        host: "example.com",
        "sec-fetch-site": "same-origin",
      },
      method: "POST",
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
      headers: {
        host: "example.com",
        origin: "not-a-valid-url",
      },
      method: "POST",
    });

    const result = requireSameOrigin(request);
    expect(result).not.toBeNull();
  });
});

// ── lib/auth/csrf – requireSameOrigin ────────────────────────────────────────

describe("lib/auth/csrf – requireSameOrigin", () => {
  test("returns null for GET requests (safe method)", async () => {
    const { requireSameOrigin } = await import("@/lib/auth/csrf");
    const req = new Request("https://example.com/api", { method: "GET" });
    expect(requireSameOrigin(req)).toBeNull();
  });

  test("returns null for POST with sec-fetch-site: same-origin", async () => {
    const { requireSameOrigin } = await import("@/lib/auth/csrf");
    const req = new Request("https://example.com/api", {
      headers: { "sec-fetch-site": "same-origin" },
      method: "POST",
    });
    expect(requireSameOrigin(req)).toBeNull();
  });

  test("returns 403 for POST with sec-fetch-site: cross-site", async () => {
    const { requireSameOrigin } = await import("@/lib/auth/csrf");
    const req = new Request("https://example.com/api", {
      headers: { "sec-fetch-site": "cross-site" },
      method: "POST",
    });
    const result = requireSameOrigin(req);
    expect(result instanceof Response).toBe(true);
    if (result instanceof Response) expect(result.status).toBe(403);
  });

  test("returns null for POST with matching Origin header", async () => {
    const { requireSameOrigin } = await import("@/lib/auth/csrf");
    const req = new Request("https://example.com/api", {
      headers: { host: "example.com", origin: "https://example.com" },
      method: "POST",
    });
    expect(requireSameOrigin(req)).toBeNull();
  });

  test("returns 403 for POST with mismatched Origin header", async () => {
    const { requireSameOrigin } = await import("@/lib/auth/csrf");
    const req = new Request("https://example.com/api", {
      headers: { host: "example.com", origin: "https://attacker.com" },
      method: "POST",
    });
    const result = requireSameOrigin(req);
    expect(result instanceof Response).toBe(true);
    if (result instanceof Response) expect(result.status).toBe(403);
  });
});

// ─── csrf.ts ──────────────────────────────────────────────────────────────────

describe("csrf – requireSameOrigin", () => {
  test("allows GET requests", () => {
    const request = new Request("https://example.com/api/test", {
      method: "GET",
    });
    expect(requireSameOrigin(request)).toBeNull();
  });

  test("allows HEAD requests", () => {
    const request = new Request("https://example.com/api/test", {
      method: "HEAD",
    });
    expect(requireSameOrigin(request)).toBeNull();
  });

  test("allows OPTIONS requests", () => {
    const request = new Request("https://example.com/api/test", {
      method: "OPTIONS",
    });
    expect(requireSameOrigin(request)).toBeNull();
  });

  test("allows POST with same-origin header", () => {
    const request = new Request("https://example.com/api/test", {
      headers: {
        host: "example.com",
        origin: "https://example.com",
        "sec-fetch-site": "same-origin",
      },
      method: "POST",
    });
    expect(requireSameOrigin(request)).toBeNull();
  });

  test("rejects POST with cross-origin", () => {
    const request = new Request("https://example.com/api/test", {
      headers: {
        host: "example.com",
        origin: "https://evil.com",
        "sec-fetch-site": "cross-site",
      },
      method: "POST",
    });
    const result = requireSameOrigin(request);
    expect(result).not.toBeNull();
    expect(result!.status).toBe(403);
  });

  test("rejects POST with no origin, no referer, no sec-fetch-site", () => {
    const request = new Request("https://example.com/api/test", {
      headers: { host: "example.com" },
      method: "POST",
    });
    const result = requireSameOrigin(request);
    expect(result).not.toBeNull();
    expect(result!.status).toBe(403);
  });

  test("allows POST with same-site sec-fetch-site and no origin/referer", () => {
    const request = new Request("https://example.com/api/test", {
      headers: {
        host: "example.com",
        "sec-fetch-site": "same-origin",
      },
      method: "POST",
    });
    expect(requireSameOrigin(request)).toBeNull();
  });

  test("allows POST with referer from same origin", () => {
    const request = new Request("https://example.com/api/test", {
      headers: {
        host: "example.com",
        referer: "https://example.com/dashboard",
      },
      method: "POST",
    });
    expect(requireSameOrigin(request)).toBeNull();
  });

  test("rejects POST with referer from different origin", () => {
    const request = new Request("https://example.com/api/test", {
      headers: {
        host: "example.com",
        referer: "https://evil.com/page",
      },
      method: "POST",
    });
    const result = requireSameOrigin(request);
    expect(result).not.toBeNull();
    expect(result!.status).toBe(403);
  });

  test("rejects DELETE with sec-fetch-site cross-site", () => {
    const request = new Request("https://example.com/api/test", {
      headers: {
        host: "example.com",
        "sec-fetch-site": "cross-site",
      },
      method: "DELETE",
    });
    const result = requireSameOrigin(request);
    expect(result).not.toBeNull();
    expect(result!.status).toBe(403);
  });
});
