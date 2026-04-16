import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { NextResponse } from "next/server";

import {
  clearSessionCookie,
  hashPassword,
  SESSION_COOKIE_NAME,
  setSessionCookie,
  verifyPassword,
} from "@/lib/auth";
import {
  normalizeEmailInput,
  parseEmailPasswordFromFormData,
  parseEmailPasswordFromRecord,
  parseEmailPasswordFromSearchParams,
} from "@/lib/auth/credentials";

beforeEach(() => mock.restore());
afterEach(() => mock.restore());
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
      password: "secret123",
      username: "test@example.com",
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
      { pass: "secret", user: "test@x.com" },
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
