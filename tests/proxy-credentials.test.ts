import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import {
  encryptStoredProxyPassword,
  resolveStoredProxyPassword,
} from "@/lib/server/proxy-credentials";

const LONG_SECRET = "a]9kF!#vQ2pL7mXrTz1NdS0bG4hY8cWu";
const ALT_SECRET = "x!rZ3kQ8pL0mN7vTdS1bG4hY9cWuFJ2a";

let envSnapshot: Record<string, string | undefined>;

beforeEach(() => {
  envSnapshot = {
    DATABASE_URL: process.env.DATABASE_URL,
    PROXY_CREDENTIAL_ENCRYPTION_KEY:
      process.env.PROXY_CREDENTIAL_ENCRYPTION_KEY,
  };
});

afterEach(() => {
  process.env.DATABASE_URL = envSnapshot.DATABASE_URL;
  process.env.PROXY_CREDENTIAL_ENCRYPTION_KEY =
    envSnapshot.PROXY_CREDENTIAL_ENCRYPTION_KEY;
});

describe("getProxyPasswordEncryptionKey fallback", () => {
  test("uses PROXY_CREDENTIAL_ENCRYPTION_KEY when set", () => {
    process.env.PROXY_CREDENTIAL_ENCRYPTION_KEY = LONG_SECRET;
    process.env.DATABASE_URL = ALT_SECRET;

    const encrypted = encryptStoredProxyPassword("test-password");
    expect(encrypted).toStartWith("enc-v1:");

    const resolved = resolveStoredProxyPassword(encrypted);
    expect(resolved.decryptedPassword).toBe("test-password");
  });

  test("falls back to DATABASE_URL when PROXY_CREDENTIAL_ENCRYPTION_KEY is empty string", () => {
    process.env.PROXY_CREDENTIAL_ENCRYPTION_KEY = "";
    process.env.DATABASE_URL = ALT_SECRET;

    const encrypted = encryptStoredProxyPassword("my-proxy-pass");
    expect(encrypted).toStartWith("enc-v1:");

    const resolved = resolveStoredProxyPassword(encrypted);
    expect(resolved.decryptedPassword).toBe("my-proxy-pass");
  });

  test("falls back to DATABASE_URL when PROXY_CREDENTIAL_ENCRYPTION_KEY is whitespace-only", () => {
    process.env.PROXY_CREDENTIAL_ENCRYPTION_KEY = "   ";
    process.env.DATABASE_URL = ALT_SECRET;

    const encrypted = encryptStoredProxyPassword("secret");
    expect(encrypted).toStartWith("enc-v1:");

    const resolved = resolveStoredProxyPassword(encrypted);
    expect(resolved.decryptedPassword).toBe("secret");
  });

  test("falls back to DATABASE_URL when PROXY_CREDENTIAL_ENCRYPTION_KEY is undefined", () => {
    delete process.env.PROXY_CREDENTIAL_ENCRYPTION_KEY;
    process.env.DATABASE_URL = ALT_SECRET;

    const encrypted = encryptStoredProxyPassword("pwd");
    expect(encrypted).toStartWith("enc-v1:");

    const resolved = resolveStoredProxyPassword(encrypted);
    expect(resolved.decryptedPassword).toBe("pwd");
  });

  test("throws when neither key nor DATABASE_URL is available", () => {
    delete process.env.PROXY_CREDENTIAL_ENCRYPTION_KEY;
    delete process.env.DATABASE_URL;

    expect(() => encryptStoredProxyPassword("pwd")).toThrow(
      /PROXY_CREDENTIAL_ENCRYPTION_KEY must be at least 32 characters long/,
    );
  });

  test("throws when both secrets are too short", () => {
    process.env.PROXY_CREDENTIAL_ENCRYPTION_KEY = "short";
    process.env.DATABASE_URL = "tiny";

    expect(() => encryptStoredProxyPassword("pwd")).toThrow(
      /PROXY_CREDENTIAL_ENCRYPTION_KEY must be at least 32 characters long/,
    );
  });
});

describe("encrypt / decrypt round-trip", () => {
  test("round-trips through encrypt and resolveStoredProxyPassword", () => {
    process.env.PROXY_CREDENTIAL_ENCRYPTION_KEY = LONG_SECRET;

    const encrypted = encryptStoredProxyPassword("hunter2");
    const resolved = resolveStoredProxyPassword(encrypted);

    expect(resolved.decryptedPassword).toBe("hunter2");
    expect(resolved.needsWriteback).toBe(false);
    expect(resolved.normalizedStoredPassword).toBe(encrypted);
  });

  test("encrypts differently each time due to random IV", () => {
    process.env.PROXY_CREDENTIAL_ENCRYPTION_KEY = LONG_SECRET;

    const a = encryptStoredProxyPassword("password");
    const b = encryptStoredProxyPassword("password");
    expect(a).not.toBe(b);

    expect(resolveStoredProxyPassword(a).decryptedPassword).toBe("password");
    expect(resolveStoredProxyPassword(b).decryptedPassword).toBe("password");
  });
});

describe("resolveStoredProxyPassword", () => {
  test("returns null for null input", () => {
    const resolved = resolveStoredProxyPassword(null);
    expect(resolved).toEqual({
      decryptedPassword: null,
      needsWriteback: false,
      normalizedStoredPassword: null,
    });
  });

  test("returns needsWriteback for empty string", () => {
    const resolved = resolveStoredProxyPassword("");
    expect(resolved).toEqual({
      decryptedPassword: null,
      needsWriteback: true,
      normalizedStoredPassword: null,
    });
  });

  test("upgrades plaintext password and signals writeback", () => {
    process.env.PROXY_CREDENTIAL_ENCRYPTION_KEY = LONG_SECRET;

    const resolved = resolveStoredProxyPassword("legacy-plain-password");
    expect(resolved.decryptedPassword).toBe("legacy-plain-password");
    expect(resolved.needsWriteback).toBe(true);
    expect(resolved.normalizedStoredPassword).toStartWith("enc-v1:");
  });
});
