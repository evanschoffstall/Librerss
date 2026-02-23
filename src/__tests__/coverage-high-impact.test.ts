import { describe, expect, test } from "bun:test";

describe("auth/credentials", () => {
  test("parseEmailPasswordFromRecord normalizes email and supports custom keys", async () => {
    const {
      parseEmailPasswordFromRecord,
      parseEmailPasswordFromSearchParams,
      parseEmailPasswordFromFormData,
    } = await import("@/lib/auth/credentials");

    expect(
      parseEmailPasswordFromRecord({
        Email: "  USER@Example.com  ",
        Passwd: "pw",
      }),
    ).toEqual({ email: "user@example.com", password: "pw" });

    expect(
      parseEmailPasswordFromRecord(
        { login: "a@b.com", secret: "pw2" },
        { emailKeys: ["login"], passwordKeys: ["secret"] },
      ),
    ).toEqual({ email: "a@b.com", password: "pw2" });

    const params = new URLSearchParams({
      username: "Person@Mail.com",
      passwd: "123",
    });
    expect(parseEmailPasswordFromSearchParams(params)).toEqual({
      email: "person@mail.com",
      password: "123",
    });

    const form = new FormData();
    form.set("email", "Form@Mail.com");
    form.set("password", "x");
    expect(parseEmailPasswordFromFormData(form)).toEqual({
      email: "form@mail.com",
      password: "x",
    });

    expect(
      parseEmailPasswordFromRecord({ email: "", password: "x" }),
    ).toBeNull();
  });
});

describe("api/request helpers", () => {
  test("parseJsonBody handles valid, invalid, and oversized payloads", async () => {
    const { parseJsonBody } = await import("@/lib/api/request");

    const okReq = new Request("https://example.com", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ok: true }),
    });
    const ok = await parseJsonBody<{ ok: boolean }>(okReq, { maxBytes: 1024 });
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.data.ok).toBe(true);

    const invalidReq = new Request("https://example.com", {
      method: "POST",
      body: "{bad-json",
    });
    const invalid = await parseJsonBody(invalidReq, { maxBytes: 1024 });
    expect(invalid.ok).toBe(false);

    const headerTooLargeReq = new Request("https://example.com", {
      method: "POST",
      headers: { "content-length": "9999" },
      body: "{}",
    });
    const headerTooLarge = await parseJsonBody(headerTooLargeReq, {
      maxBytes: 2,
    });
    expect(headerTooLarge.ok).toBe(false);

    const bodyTooLargeReq = new Request("https://example.com", {
      method: "POST",
      body: "123456",
    });
    const bodyTooLarge = await parseJsonBody(bodyTooLargeReq, { maxBytes: 2 });
    expect(bodyTooLarge.ok).toBe(false);
  });

  test("parseFormOrQueryParams and scalar parsers", async () => {
    const {
      parseFormOrQueryParams,
      asTrimmedString,
      parsePositiveInt,
      parseDateInput,
    } = await import("@/lib/api/request");

    const getReq = new Request("https://example.com/path?a=1&b=2");
    const getParams = await parseFormOrQueryParams(getReq);
    expect(getParams instanceof URLSearchParams).toBe(true);
    if (getParams instanceof URLSearchParams) {
      expect(getParams.get("a")).toBe("1");
    }

    const postReq = new Request("https://example.com/path", {
      method: "POST",
      body: "x=1&y=2",
      headers: { "content-type": "application/x-www-form-urlencoded" },
    });
    const postParams = await parseFormOrQueryParams(postReq, {
      maxBytes: 1024,
    });
    expect(postParams instanceof URLSearchParams).toBe(true);

    const tooLargeReq = new Request("https://example.com/path", {
      method: "POST",
      headers: { "content-length": "100" },
      body: "x=1",
    });
    const tooLarge = await parseFormOrQueryParams(tooLargeReq, { maxBytes: 1 });
    expect(tooLarge instanceof Response).toBe(true);

    expect(asTrimmedString("  hi  ")).toBe("hi");
    expect(asTrimmedString(42)).toBe("");
    expect(parsePositiveInt("5")).toBe(5);
    expect(parsePositiveInt("-1")).toBeNull();
    expect(parseDateInput("2024-01-01T00:00:00.000Z")?.toISOString()).toBe(
      "2024-01-01T00:00:00.000Z",
    );
    expect(parseDateInput("not-a-date")).toBeNull();
  });
});

describe("core/feed-url-validator", () => {
  test("blocks invalid protocol, credentials, and blocked hosts", async () => {
    const { assertPublicFeedUrl, isAllowedFeedUrl } =
      await import("@/lib/core/feed-url-validator");

    await expect(assertPublicFeedUrl("javascript:alert(1)")).rejects.toThrow();
    await expect(
      assertPublicFeedUrl("https://user:pass@example.com/feed"),
    ).rejects.toThrow();
    await expect(
      assertPublicFeedUrl("https://localhost/feed.xml"),
    ).rejects.toThrow();

    expect(await isAllowedFeedUrl("https://localhost/feed.xml")).toBe(false);
  });
});
