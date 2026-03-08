import {
  getRequestedFeedUrl,
  parseCreateFeedPayload,
  parseDeleteSourceId,
  parseRenameFeedPayload,
  parseRenameFeedPayloadFromBody,
  parseToggleFeedEnabledPayloadFromBody,
  parseUpdateFeedSettingsPayloadFromBody,
} from "@/lib/api/feeds/parsers";
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { NextRequest } from "next/server";

beforeEach(() => mock.restore());
afterEach(() => mock.restore());
describe("parseCreateFeedPayload", () => {
  test("parses valid create payload", async () => {
    const body = JSON.stringify({
      name: "My Feed",
      url: "https://example.com/feed",
    });
    const request = new NextRequest("http://localhost/api/feeds", {
      method: "POST",
      body,
      headers: { "content-type": "application/json" },
    });
    const result = await parseCreateFeedPayload(request);
    expect(result).not.toBeInstanceOf(Response);
    if (!(result instanceof Response)) {
      expect(result.name).toBe("My Feed");
      expect(result.url).toBe("https://example.com/feed");
      expect(typeof result.category).toBe("string");
    }
  });

  test("returns error for missing name", async () => {
    const body = JSON.stringify({ url: "https://example.com/feed" });
    const request = new NextRequest("http://localhost/api/feeds", {
      method: "POST",
      body,
      headers: { "content-type": "application/json" },
    });
    const result = await parseCreateFeedPayload(request);
    expect(result).toBeInstanceOf(Response);
    if (result instanceof Response) {
      expect(result.status).toBe(400);
    }
  });

  test("returns error for missing url", async () => {
    const body = JSON.stringify({ name: "Feed" });
    const request = new NextRequest("http://localhost/api/feeds", {
      method: "POST",
      body,
      headers: { "content-type": "application/json" },
    });
    const result = await parseCreateFeedPayload(request);
    expect(result).toBeInstanceOf(Response);
  });

  test("uses custom category when provided", async () => {
    const body = JSON.stringify({
      name: "Feed",
      url: "https://example.com/feed",
      category: "  Tech  ",
    });
    const request = new NextRequest("http://localhost/api/feeds", {
      method: "POST",
      body,
      headers: { "content-type": "application/json" },
    });
    const result = await parseCreateFeedPayload(request);
    expect(result).not.toBeInstanceOf(Response);
    if (!(result instanceof Response)) {
      expect(result.category).toBe("Tech");
    }
  });

  test("rejects overly long name", async () => {
    const body = JSON.stringify({
      name: "A".repeat(500),
      url: "https://example.com/feed",
    });
    const request = new NextRequest("http://localhost/api/feeds", {
      method: "POST",
      body,
      headers: { "content-type": "application/json" },
    });
    const result = await parseCreateFeedPayload(request);
    expect(result).toBeInstanceOf(Response);
    if (result instanceof Response) {
      expect(result.status).toBe(400);
    }
  });
});

// ─── feed-parsers: parseRenameFeedPayload ─────────────────────────────────────

describe("parseRenameFeedPayload", () => {
  test("parses valid rename payload", async () => {
    const body = JSON.stringify({
      id: 42,
      name: "New Name",
      url: "https://x.com/feed",
    });
    const request = new NextRequest("http://localhost/api/feeds", {
      method: "PATCH",
      body,
      headers: { "content-type": "application/json" },
    });
    const result = await parseRenameFeedPayload(request);
    expect(result).not.toBeInstanceOf(Response);
    if (!(result instanceof Response)) {
      expect(result.sourceId).toBe(42);
      expect(result.name).toBe("New Name");
      expect(result.url).toBe("https://x.com/feed");
    }
  });

  test("returns error for missing id", async () => {
    const body = JSON.stringify({ name: "New", url: "https://x.com" });
    const request = new NextRequest("http://localhost/api/feeds", {
      method: "PATCH",
      body,
      headers: { "content-type": "application/json" },
    });
    const result = await parseRenameFeedPayload(request);
    expect(result).toBeInstanceOf(Response);
  });

  test("returns error for missing name", async () => {
    const body = JSON.stringify({ id: 1, url: "https://x.com" });
    const request = new NextRequest("http://localhost/api/feeds", {
      method: "PATCH",
      body,
      headers: { "content-type": "application/json" },
    });
    const result = await parseRenameFeedPayload(request);
    expect(result).toBeInstanceOf(Response);
  });

  test("returns error for missing url", async () => {
    const body = JSON.stringify({ id: 1, name: "Name" });
    const request = new NextRequest("http://localhost/api/feeds", {
      method: "PATCH",
      body,
      headers: { "content-type": "application/json" },
    });
    const result = await parseRenameFeedPayload(request);
    expect(result).toBeInstanceOf(Response);
  });

  test("rejects overly long name", async () => {
    const body = JSON.stringify({
      id: 1,
      name: "A".repeat(500),
      url: "https://x.com/feed",
    });
    const request = new NextRequest("http://localhost/api/feeds", {
      method: "PATCH",
      body,
      headers: { "content-type": "application/json" },
    });
    const result = await parseRenameFeedPayload(request);
    expect(result).toBeInstanceOf(Response);
    if (result instanceof Response) {
      expect(result.status).toBe(400);
    }
  });
});

describe("parseRenameFeedPayloadFromBody", () => {
  test("rejects overly long url", () => {
    const result = parseRenameFeedPayloadFromBody({
      id: 1,
      name: "Feed",
      url: `https://example.com/${"x".repeat(2100)}`,
    });
    expect(result).toBeInstanceOf(Response);
    if (result instanceof Response) {
      expect(result.status).toBe(400);
    }
  });
});

describe("parseToggleFeedEnabledPayloadFromBody", () => {
  test("parses valid toggle payload", () => {
    const result = parseToggleFeedEnabledPayloadFromBody({
      id: 17,
      enabled: true,
    });
    expect(result).toEqual({ sourceId: 17, enabled: true });
  });

  test("rejects non-boolean enabled", () => {
    const result = parseToggleFeedEnabledPayloadFromBody({
      id: 17,
      enabled: "true",
    });
    expect(result).toBeInstanceOf(Response);
    if (result instanceof Response) {
      expect(result.status).toBe(400);
    }
  });
});

describe("parseUpdateFeedSettingsPayloadFromBody", () => {
  test("rejects payload without mutable fields", () => {
    const result = parseUpdateFeedSettingsPayloadFromBody({ id: 12 });
    expect(result).toBeInstanceOf(Response);
    if (result instanceof Response) {
      expect(result.status).toBe(400);
    }
  });

  test("parses extractionDisabled-only payload", () => {
    const result = parseUpdateFeedSettingsPayloadFromBody({
      id: 12,
      extractionDisabled: true,
    });
    expect(result).toEqual({ sourceId: 12, extractionDisabled: true });
  });

  test("parses proxyEnabled-only payload", () => {
    const result = parseUpdateFeedSettingsPayloadFromBody({
      id: 12,
      proxyEnabled: false,
    });
    expect(result).toEqual({ sourceId: 12, proxyEnabled: false });
  });

  test("parses payload with both mutable fields", () => {
    const result = parseUpdateFeedSettingsPayloadFromBody({
      id: 12,
      extractionDisabled: false,
      proxyEnabled: true,
    });
    expect(result).toEqual({
      sourceId: 12,
      extractionDisabled: false,
      proxyEnabled: true,
    });
  });
});

// ─── feed-parsers: parseDeleteSourceId ────────────────────────────────────────

describe("parseDeleteSourceId", () => {
  test("parses valid id from query string", () => {
    const request = new NextRequest("http://localhost/api/feeds?id=42");
    const result = parseDeleteSourceId(request);
    expect(result).toBe(42);
  });

  test("returns error for missing id", () => {
    const request = new NextRequest("http://localhost/api/feeds");
    const result = parseDeleteSourceId(request);
    expect(result).toBeInstanceOf(Response);
  });

  test("returns error for non-numeric id", () => {
    const request = new NextRequest("http://localhost/api/feeds?id=abc");
    const result = parseDeleteSourceId(request);
    expect(result).toBeInstanceOf(Response);
  });

  test("returns error for negative id", () => {
    const request = new NextRequest("http://localhost/api/feeds?id=-5");
    const result = parseDeleteSourceId(request);
    expect(result).toBeInstanceOf(Response);
  });

  test("returns error for zero id", () => {
    const request = new NextRequest("http://localhost/api/feeds?id=0");
    const result = parseDeleteSourceId(request);
    expect(result).toBeInstanceOf(Response);
  });
});

// ─── feed-parsers: getRequestedFeedUrl ────────────────────────────────────────

describe("getRequestedFeedUrl", () => {
  test("extracts url from query string", () => {
    const request = new NextRequest(
      "http://localhost/api/feeds?url=https://example.com/feed",
    );
    expect(getRequestedFeedUrl(request)).toBe("https://example.com/feed");
  });

  test("returns null when no url param", () => {
    const request = new NextRequest("http://localhost/api/feeds");
    expect(getRequestedFeedUrl(request)).toBeNull();
  });

  test("returns null for empty url param", () => {
    const request = new NextRequest("http://localhost/api/feeds?url=");
    expect(getRequestedFeedUrl(request)).toBeNull();
  });

  test("trims whitespace from url param", () => {
    const request = new NextRequest(
      "http://localhost/api/feeds?url=%20https://x.com/feed%20",
    );
    expect(getRequestedFeedUrl(request)).toBe("https://x.com/feed");
  });
});

// ─── feed-repository: toFeedSourceResponse ────────────────────────────────────
