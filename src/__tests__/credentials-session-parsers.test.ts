/**
 * Tests for credentials parsing, session utilities, feed-parsers, and
 * feed-repository helpers. No module mocking — tests exercise pure functions
 * and async crypto with real modules.
 */
import {
  toggleReadStatus,
  toggleStarredStatus,
} from "@/app/dashboard/hooks/useArticleActions";
import {
  getRequestedFeedUrl,
  parseCreateFeedPayload,
  parseDeleteSourceId,
  parseRenameFeedPayload,
  parseRenameFeedPayloadFromBody,
  parseToggleFeedEnabledPayloadFromBody,
  parseUpdateFeedSettingsPayloadFromBody,
} from "@/lib/api/feeds/parsers";
import { toFeedSourceResponse } from "@/lib/api/feeds/repository";
import {
  normalizeEmailInput,
  parseEmailPasswordFromFormData,
  parseEmailPasswordFromRecord,
  parseEmailPasswordFromSearchParams,
} from "@/lib/auth/credentials";
import {
  SESSION_COOKIE_NAME,
  clearSessionCookie,
  hashPassword,
  setSessionCookie,
  verifyPassword,
} from "@/lib/auth/session";
import * as schema from "@/lib/db/schema";
import { describe, expect, test } from "bun:test";
import { NextRequest, NextResponse } from "next/server";
// ─── credentials: normalizeEmailInput ─────────────────────────────────────────

describe("normalizeEmailInput", () => {
  test("trims and lowercases email string", () => {
    expect(normalizeEmailInput("  User@Example.COM  ")).toBe(
      "user@example.com",
    );
  });

  test("returns empty string for non-string input", () => {
    expect(normalizeEmailInput(null)).toBe("");
    expect(normalizeEmailInput(undefined)).toBe("");
    expect(normalizeEmailInput(123)).toBe("");
  });

  test("returns empty string for empty string", () => {
    expect(normalizeEmailInput("")).toBe("");
    expect(normalizeEmailInput("   ")).toBe("");
  });
});

// ─── credentials: parseEmailPasswordFromRecord ───────────────────────────────

describe("parseEmailPasswordFromRecord", () => {
  test("extracts email and password from default keys", () => {
    const result = parseEmailPasswordFromRecord({
      email: "test@example.com",
      password: "secret123",
    });
    expect(result).toEqual({
      email: "test@example.com",
      password: "secret123",
    });
  });

  test("accepts Email key", () => {
    const result = parseEmailPasswordFromRecord({
      Email: "test@example.com",
      password: "secret123",
    });
    expect(result).toEqual({
      email: "test@example.com",
      password: "secret123",
    });
  });

  test("accepts username as email key", () => {
    const result = parseEmailPasswordFromRecord({
      username: "test@example.com",
      password: "secret123",
    });
    expect(result).toEqual({
      email: "test@example.com",
      password: "secret123",
    });
  });

  test("accepts Passwd as password key", () => {
    const result = parseEmailPasswordFromRecord({
      email: "test@example.com",
      Passwd: "secret123",
    });
    expect(result).toEqual({
      email: "test@example.com",
      password: "secret123",
    });
  });

  test("returns null when email is missing", () => {
    expect(parseEmailPasswordFromRecord({ password: "secret" })).toBeNull();
  });

  test("returns null when password is missing", () => {
    expect(parseEmailPasswordFromRecord({ email: "test@x.com" })).toBeNull();
  });

  test("returns null when both are missing", () => {
    expect(parseEmailPasswordFromRecord({})).toBeNull();
  });

  test("normalizes email before returning", () => {
    const result = parseEmailPasswordFromRecord({
      email: "  TEST@EXAMPLE.COM  ",
      password: "pass",
    });
    expect(result?.email).toBe("test@example.com");
  });

  test("accepts custom field keys", () => {
    const result = parseEmailPasswordFromRecord(
      { user: "test@x.com", pass: "secret" },
      { emailKeys: ["user"], passwordKeys: ["pass"] },
    );
    expect(result?.email).toBe("test@x.com");
    expect(result?.password).toBe("secret");
  });
});

// ─── credentials: parseEmailPasswordFromSearchParams ─────────────────────────

describe("parseEmailPasswordFromSearchParams", () => {
  test("extracts from URLSearchParams", () => {
    const params = new URLSearchParams("email=test@x.com&password=secret");
    const result = parseEmailPasswordFromSearchParams(params);
    expect(result?.email).toBe("test@x.com");
    expect(result?.password).toBe("secret");
  });

  test("prefers first matching key", () => {
    const params = new URLSearchParams("Email=TEST@x.com&Passwd=pass123");
    const result = parseEmailPasswordFromSearchParams(params);
    expect(result?.email).toBe("test@x.com");
    expect(result?.password).toBe("pass123");
  });

  test("returns null when email is missing", () => {
    const params = new URLSearchParams("password=secret");
    expect(parseEmailPasswordFromSearchParams(params)).toBeNull();
  });
});

// ─── credentials: parseEmailPasswordFromFormData ─────────────────────────────

describe("parseEmailPasswordFromFormData", () => {
  test("extracts from FormData", () => {
    const form = new FormData();
    form.set("email", "test@x.com");
    form.set("password", "secret");
    const result = parseEmailPasswordFromFormData(form);
    expect(result?.email).toBe("test@x.com");
    expect(result?.password).toBe("secret");
  });

  test("accepts Passwd key", () => {
    const form = new FormData();
    form.set("username", "test@x.com");
    form.set("Passwd", "pass");
    const result = parseEmailPasswordFromFormData(form);
    expect(result?.email).toBe("test@x.com");
    expect(result?.password).toBe("pass");
  });

  test("returns null with empty form", () => {
    expect(parseEmailPasswordFromFormData(new FormData())).toBeNull();
  });

  test("returns null when password is non-string", () => {
    const form = new FormData();
    form.set("email", "test@x.com");
    // No password
    expect(parseEmailPasswordFromFormData(form)).toBeNull();
  });
});

// ─── session: hashPassword and verifyPassword ─────────────────────────────────

describe("session password hashing", () => {
  test("hashPassword creates v2 prefixed hash", async () => {
    const hash = await hashPassword("TestPass123!");
    expect(hash.startsWith("v2:")).toBe(true);
    // v2:salt:keyhex
    const parts = hash.split(":");
    expect(parts).toHaveLength(3);
    expect(parts[1].length).toBe(32); // 16 bytes hex
    expect(parts[2].length).toBe(128); // 64 bytes hex
  });

  test("hashPassword generates unique hashes for same password", async () => {
    const h1 = await hashPassword("same");
    const h2 = await hashPassword("same");
    expect(h1).not.toBe(h2);
  });

  test("verifyPassword validates correct password", async () => {
    const hash = await hashPassword("correct");
    expect(await verifyPassword("correct", hash)).toBe(true);
  });

  test("verifyPassword rejects wrong password", async () => {
    const hash = await hashPassword("correct");
    expect(await verifyPassword("wrong", hash)).toBe(false);
  });

  test("verifyPassword handles v1 (non-prefixed) hashes", async () => {
    // A legacy v1 hash format: salt:keyhex (no v2: prefix)
    // We just test it doesn't crash and handles format correctly
    const fakeHash = "abcdef1234567890:0123456789abcdef";
    // Should return false (wrong password) but not throw
    const result = await verifyPassword("test", fakeHash);
    expect(typeof result).toBe("boolean");
  });

  test("verifyPassword returns false for malformed hash", async () => {
    expect(await verifyPassword("test", "")).toBe(false);
    expect(await verifyPassword("test", "no-colon")).toBe(false);
    expect(await verifyPassword("test", "v2:")).toBe(false);
  });
});

// ─── session: cookie helpers ──────────────────────────────────────────────────

describe("session cookie helpers", () => {
  test("SESSION_COOKIE_NAME is defined", () => {
    expect(SESSION_COOKIE_NAME).toBe("librerss_session");
  });

  test("setSessionCookie sets cookie on response", () => {
    const response = NextResponse.json({ ok: true });
    setSessionCookie(response, "test-token-123");
    const cookie = response.cookies.get(SESSION_COOKIE_NAME);
    expect(cookie?.value).toBe("test-token-123");
  });

  test("clearSessionCookie clears cookie on response", () => {
    const response = NextResponse.json({ ok: true });
    clearSessionCookie(response);
    const cookie = response.cookies.get(SESSION_COOKIE_NAME);
    expect(cookie?.value).toBe("");
  });
});

// ─── useArticleActions: exported pure helpers ─────────────────────────────────

describe("useArticleActions exported helpers", () => {
  test("toggleReadStatus inverts boolean", () => {
    expect(toggleReadStatus(true)).toBe(false);
    expect(toggleReadStatus(false)).toBe(true);
  });

  test("toggleStarredStatus inverts boolean", () => {
    expect(toggleStarredStatus(true)).toBe(false);
    expect(toggleStarredStatus(false)).toBe(true);
  });
});

// ─── feed-parsers: parseCreateFeedPayload ─────────────────────────────────────

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

describe("toFeedSourceResponse", () => {
  test("defaults empty category to My Feeds", () => {
    const row = { id: 1, name: "F", url: "https://x.com", category: "" };
    const result = toFeedSourceResponse(row);
    expect(result.category).toBe("My Feeds");
  });

  test("defaults null category to My Feeds", () => {
    const row = { id: 1, name: "F", url: "https://x.com", category: null };
    const result = toFeedSourceResponse(row as any);
    expect(result.category).toBe("My Feeds");
  });

  test("trims existing category", () => {
    const row = {
      id: 1,
      name: "F",
      url: "https://x.com",
      category: "  Tech  ",
    };
    const result = toFeedSourceResponse(row);
    expect(result.category).toBe("Tech");
  });

  test("preserves non-empty category", () => {
    const row = { id: 1, name: "F", url: "https://x.com", category: "Tech" };
    const result = toFeedSourceResponse(row);
    expect(result.category).toBe("Tech");
  });
});

// ─── schema: table definitions ────────────────────────────────────────────────

describe("schema tables", () => {
  test("all tables are importable and defined", () => {
    expect(schema.users).toBeDefined();
    expect(schema.sessions).toBeDefined();
    expect(schema.feeds).toBeDefined();
    expect(schema.articles).toBeDefined();
    expect(schema.feedSources).toBeDefined();
    expect(schema.feedCategories).toBeDefined();
    expect(schema.categoryOrders).toBeDefined();
    expect(schema.articleStatuses).toBeDefined();
  });
});
