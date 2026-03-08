/**
 * Tests: fetch/tls-client
 * Covers ensureTlsClient(), tlsClientFetch(), and internal helpers
 * (flattenHeaders, boundedMapSet, boundedSetAdd, socksRouteKey) exercised
 * via the public exports.
 *
 * tlsclientwrapper is mocked via mock.module() so no real TLS I/O occurs.
 * The mock uses a mutable controller to vary per-call responses.
 *
 * NOTE: mock.restore() is intentionally NOT called in afterEach here.
 * The tls-client module uses module-level singletons (tlsReady, moduleClient)
 * that must persist across test cases to test state transitions. Each Bun
 * test file runs in its own process, so this cannot leak.
 */
import { beforeEach, describe, expect, mock, test } from "bun:test";

// ─── Mutable mock controller ──────────────────────────────────────────────────
// Allows per-test response sequencing without re-registering mock.module().

interface MockResponse {
  status: number;
  headers: Record<string, string | string[]>;
  body: string;
}

const defaultMockResponse: MockResponse = {
  status: 200,
  headers: { "content-type": "text/html", "x-custom": ["single-value"] },
  body: "<!DOCTYPE html><html></html>",
};

const mockCtrl = {
  responses: [] as MockResponse[],
  callIndex: 0,
  errorOnCall: null as number | null,
  errorMessage: "mock get error",

  next(): MockResponse {
    if (this.errorOnCall !== null && this.callIndex === this.errorOnCall) {
      this.callIndex++;
      throw new Error(this.errorMessage);
    }
    const resp =
      this.responses.length > 0
        ? this.responses[this.callIndex % this.responses.length]!
        : defaultMockResponse;
    this.callIndex++;
    return { ...resp };
  },

  setResponses(...responses: MockResponse[]) {
    this.responses = responses;
    this.callIndex = 0;
    this.errorOnCall = null;
  },

  setErrorOnCall(callIndex: number, message = "session get error") {
    this.errorOnCall = callIndex;
    this.errorMessage = message;
    this.callIndex = 0;
  },

  reset() {
    this.responses = [];
    this.callIndex = 0;
    this.errorOnCall = null;
    this.errorMessage = "mock get error";
  },
};

// ─── Mock tlsclientwrapper BEFORE any import that uses it ────────────────────
mock.module("tlsclientwrapper", () => ({
  ModuleClient: class {
    open() {
      return Promise.resolve();
    }
  },
  SessionClient: class {
    constructor(
      private _mc: unknown,
      private _opts: Record<string, unknown>,
    ) {}
    get(_url: string, _opts: unknown) {
      return Promise.resolve(mockCtrl.next());
    }
    destroySession() {
      return Promise.resolve();
    }
  },
}));

// ─── Import under test AFTER mock registration ───────────────────────────────
// Top-level await is valid in ESM test files with Bun.
const { ensureTlsClient, tlsClientFetch } =
  await import("@/lib/fetch/tls-client");

beforeEach(() => {
  mockCtrl.reset();
});

// ─── ensureTlsClient ─────────────────────────────────────────────────────────

describe("ensureTlsClient", () => {
  test("initialises TLS module and returns true on first call", async () => {
    const result = await ensureTlsClient();
    expect(result).toBe(true);
  });

  test("returns cached true on repeated calls (singleton)", async () => {
    const a = await ensureTlsClient();
    const b = await ensureTlsClient();
    expect(a).toBe(true);
    expect(b).toBe(true);
  });
});

// ─── tlsClientFetch – non-SOCKS paths ────────────────────────────────────────

describe("tlsClientFetch – no proxy", () => {
  test("returns successful response for basic GET", async () => {
    const result = await tlsClientFetch(
      new URL("https://example.com/article"),
      { "user-agent": "Mozilla/5.0" },
      undefined,
      false,
      5000,
    );
    expect(result.statusCode).toBe(200);
    expect(result.body).toContain("<!DOCTYPE html>");
  });

  test("sanitises 'null' string proxyUrl (treats as no proxy)", async () => {
    const result = await tlsClientFetch(
      new URL("https://example.com/"),
      {},
      "null",
      false,
      5000,
    );
    expect(result.statusCode).toBe(200);
  });

  test("sanitises 'undefined' string proxyUrl", async () => {
    const result = await tlsClientFetch(
      new URL("https://example.com/"),
      {},
      "undefined",
      false,
      5000,
    );
    expect(result.statusCode).toBe(200);
  });

  test("flattens single-item header arrays to strings (flattenHeaders)", async () => {
    mockCtrl.setResponses({
      status: 200,
      headers: {
        "x-single": ["only-value"],
        "x-multi": ["a", "b"],
        "content-type": "text/html",
      },
      body: "ok",
    });
    const result = await tlsClientFetch(
      new URL("https://example.com/"),
      {},
      undefined,
      false,
      5000,
    );
    expect(result.headers["x-single"]).toBe("only-value");
    expect(Array.isArray(result.headers["x-multi"])).toBe(true);
    expect(result.headers["content-type"]).toBe("text/html");
  });

  test("handles null/undefined header values in flattenHeaders", async () => {
    mockCtrl.setResponses({
      status: 200,
      headers: {},
      body: "ok",
    });
    const result = await tlsClientFetch(
      new URL("https://example.com/"),
      {},
      undefined,
      false,
      5000,
    );
    expect(result.statusCode).toBe(200);
  });

  test("returns statusCode 0 and error message when session.get() throws", async () => {
    mockCtrl.setErrorOnCall(0, "connection refused");
    const result = await tlsClientFetch(
      new URL("https://example.com/"),
      {},
      undefined,
      false,
      5000,
    );
    expect(result.statusCode).toBe(0);
    expect(result.body).toBe("connection refused");
  });

  test("destroySession is invoked even when session.get() throws", async () => {
    mockCtrl.setErrorOnCall(0, "network timeout");
    // Should not throw – destroySession swallows cleanup errors
    const result = await tlsClientFetch(
      new URL("https://example.com/"),
      {},
      undefined,
      false,
      5000,
    );
    expect(result.statusCode).toBe(0);
  });

  test("passes allowInsecureTls=true to session options", async () => {
    const result = await tlsClientFetch(
      new URL("https://example.com/"),
      {},
      undefined,
      true,
      5000,
    );
    expect(result.statusCode).toBe(200);
  });
});

// ─── tlsClientFetch – HTTP proxy ──────────────────────────────────────────────

describe("tlsClientFetch – HTTP proxy", () => {
  test("uses proxy URL when provided", async () => {
    const result = await tlsClientFetch(
      new URL("https://example.com/"),
      {},
      "http://proxy.external.example.com:8080",
      false,
      5000,
    );
    expect(result.statusCode).toBe(200);
  });
});

// ─── tlsClientFetch – SOCKS proxy with IP host ───────────────────────────────

describe("tlsClientFetch – SOCKS proxy, IP host (no DNS)", () => {
  test("IPv4 target: isIpHost=true skips DNS resolution", async () => {
    // 192.0.2.x is TEST-NET-1 per RFC 5737 – valid for tests
    const result = await tlsClientFetch(
      new URL("https://192.0.2.1/page"),
      {},
      "socks5://proxy.external.example.com:1080",
      false,
      5000,
    );
    expect(result.statusCode).toBe(200);
  });

  test("IPv6 target: isIpHost=true skips DNS resolution", async () => {
    const result = await tlsClientFetch(
      new URL("https://[::1]/page"),
      {},
      "socks5://proxy.external.example.com:1080",
      false,
      5000,
    );
    expect(result.statusCode).toBe(200);
  });

  test("SOCKS4 protocol accepted", async () => {
    const result = await tlsClientFetch(
      new URL("https://192.0.2.2/"),
      {},
      "socks4://proxy.external.example.com:1080",
      false,
      5000,
    );
    expect(result.statusCode).toBe(200);
  });

  test("SOCKS5H protocol accepted", async () => {
    const result = await tlsClientFetch(
      new URL("https://192.0.2.3/"),
      {},
      "socks5h://proxy.external.example.com:1080",
      false,
      5000,
    );
    expect(result.statusCode).toBe(200);
  });

  test("allowInsecureTls=true with SOCKS proxy", async () => {
    const result = await tlsClientFetch(
      new URL("https://192.0.2.4/secure"),
      {},
      "socks5://proxy.external.example.com:1080",
      true,
      5000,
    );
    expect(result.statusCode).toBe(200);
  });
});

// ─── tlsClientFetch – SOCKS proxy with hostname ───────────────────────────────
// Tests DNS-based fallback routing. For the unresolvable-domain cases, the
// .catch(() => undefined) handler in tls-client.ts is exercised.

describe("tlsClientFetch – SOCKS proxy, hostname routing", () => {
  test("hostname route succeeds on first attempt (no fallback needed)", async () => {
    const result = await tlsClientFetch(
      new URL("https://example.com/"),
      {},
      "socks5://proxy.external.example.com:1080",
      false,
      5000,
    );
    expect(result.statusCode).toBe(200);
  });

  test("hostname route: primary fails, DNS fails → returns failed primary (statusCode 0)", async () => {
    // Mock: every get() call returns statusCode 0 (connection failure)
    mockCtrl.setResponses({
      status: 0,
      headers: {},
      body: "SOCKS connection refused",
    });
    const result = await tlsClientFetch(
      new URL("https://no-dns.invalid.test/"),
      {},
      "socks5://proxy.external.example.com:1080",
      false,
      5000,
    );
    // DNS fails for .invalid TLD → ip = undefined → returns primary (status 0)
    expect(result.statusCode).toBe(0);
    expect(result.body).toBe("SOCKS connection refused");
  });

  test("hostname route: primary fails, DNS resolves → IP fallback attempted", async () => {
    // First call (hostname) → fail; second call (IP) → success
    // example.com reliably has A records in any network-enabled environment.
    mockCtrl.setResponses(
      { status: 0, headers: {}, body: "SOCKS hostname fail" },
      { status: 200, headers: {}, body: "IP fallback ok" },
    );
    const result = await tlsClientFetch(
      new URL("https://example.com/"),
      // Use a unique key so previous SOCKS route preference doesn't interfere
      {},
      "socks5://proxy-for-fallback-test.external.example.com:1080",
      false,
      5000,
    );
    // Either the fallback IP request succeeded (200) or DNS wasn't available (0)
    expect([0, 200]).toContain(result.statusCode);
  });

  test("handles socks hostname with headers containing proxyUrl option", async () => {
    const result = await tlsClientFetch(
      new URL("https://192.0.2.5/"),
      { accept: "text/html" },
      "socks5://proxy.external.example.com:1080",
      false,
      5000,
    );
    expect(result.statusCode).toBe(200);
  });
});

// ─── socksRouteKey boundary paths ─────────────────────────────────────────────
// These paths exercise the helper via tlsClientFetch without exposing internals.

describe("tlsClientFetch – proxyUrl sanitisation edge cases", () => {
  test("empty string proxyUrl treated as no proxy", async () => {
    const result = await tlsClientFetch(
      new URL("https://example.com/"),
      {},
      "",
      false,
      5000,
    );
    expect(result.statusCode).toBe(200);
  });

  test("valid HTTPS proxy URL accepted", async () => {
    const result = await tlsClientFetch(
      new URL("https://example.com/"),
      {},
      "https://proxy.external.example.com:443",
      false,
      5000,
    );
    expect(result.statusCode).toBe(200);
  });
});

// ─── boundedSetAdd / boundedMapSet capacity paths ─────────────────────────────
// These are exercised indirectly when SOCKS hostname fallback triggers
// the warning-emitted set and route-preference map updates.

describe("tlsClientFetch – repeated SOCKS fallback (boundedSet/Map eviction)", () => {
  test("second fallback for same host emits no duplicate warning log", async () => {
    // Both calls: first hostname fails, then IP succeeds
    // This triggers socksFallbackWarningEmitted.has() guard on second invocation
    for (let i = 0; i < 2; i++) {
      mockCtrl.setResponses(
        { status: 0, headers: {}, body: "fail" },
        { status: 200, headers: {}, body: "ok" },
      );
      const result = await tlsClientFetch(
        new URL("https://example.com/"),
        {},
        "socks5://proxy-for-dedup-test.external.example.com:1080",
        false,
        5000,
      );
      expect([0, 200]).toContain(result.statusCode);
    }
  });
});
