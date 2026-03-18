import { describe, expect, test } from "bun:test";
import { NextRequest } from "next/server";

describe("account export route", () => {
  test("GET reports when a saved proxy password exists", async () => {
    const selectResults = [
      [
        {
          allowInsecureTls: false,
          createdAt: new Date("2026-03-15T00:00:00.000Z"),
          email: "reader@example.com",
          lastForceRefreshedAt: null,
          proxyPassword: "enc-v1:test-ciphertext",
          proxyUrl: "http://proxy.example:8080",
          proxyUsername: "reader",
        },
      ],
      [],
      [],
      [],
      [],
    ];

    const { GET } = await import("@/app/api/account/export/route");
    const response = await GET(
      new NextRequest("http://localhost/api/account/export"),
      {
        getDbFn: () => ({
          select: () => {
            const result = Promise.resolve(selectResults.shift() ?? []);

            return {
              from: () => ({
                where: () => ({
                  limit: () => result,
                  then: result.then.bind(result),
                }),
              }),
            };
          },
        }),
        infoFn: () => {},
        requireAuthFn: async () => ({ userId: 42 }),
        runtimeFlags: { usePlaceholderData: false },
      },
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.user.hasProxyPassword).toBe(true);
    expect(body.user.proxyUrl).toBe("http://proxy.example:8080");
    expect(body.user.proxyUsername).toBe("reader");
  });

  test("GET strips embedded proxy credentials from exported URLs", async () => {
    const legacyEmbeddedProxyUrl = `http://${"legacy-user"}:${"legacy-pass"}@proxy.example:8080`;
    const selectResults = [
      [
        {
          allowInsecureTls: false,
          createdAt: new Date("2026-03-15T00:00:00.000Z"),
          email: "reader@example.com",
          lastForceRefreshedAt: null,
          proxyPassword: null,
          proxyUrl: legacyEmbeddedProxyUrl,
          proxyUsername: null,
        },
      ],
      [],
      [],
      [],
      [],
    ];

    const { GET } = await import("@/app/api/account/export/route");
    const response = await GET(
      new NextRequest("http://localhost/api/account/export"),
      {
        getDbFn: () => ({
          select: () => {
            const result = Promise.resolve(selectResults.shift() ?? []);

            return {
              from: () => ({
                where: () => ({
                  limit: () => result,
                  then: result.then.bind(result),
                }),
              }),
            };
          },
        }),
        infoFn: () => {},
        requireAuthFn: async () => ({ userId: 42 }),
        runtimeFlags: { usePlaceholderData: false },
      },
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.user.hasProxyPassword).toBe(true);
    expect(body.user.proxyUrl).toBe("http://proxy.example:8080");
    expect(body.user.proxyUsername).toBe("legacy-user");
  });
});