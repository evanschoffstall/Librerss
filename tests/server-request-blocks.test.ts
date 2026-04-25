import { describe, expect, test } from "bun:test";
import { NextRequest } from "next/server";

import {
  blockedRequestPolicies,
  createBlockedRequestResponse,
  matchBlockedRequestPolicy,
} from "@/edge-proxy/blocked-requests";

describe("server request blocks", () => {
  test("exports frozen blocked request policies", () => {
    expect(blockedRequestPolicies).toHaveLength(1);
    expect(Object.isFrozen(blockedRequestPolicies)).toBe(true);
    expect(Object.isFrozen(blockedRequestPolicies[0])).toBe(true);
    expect(Object.isFrozen(blockedRequestPolicies[0].pathPrefixes)).toBe(true);
  });

  test("matches reserved blocked path prefixes", () => {
    expect(matchBlockedRequestPolicy("/@firewall-check")?.code).toBe(
      "FW-RESERVED-PATH",
    );
    expect(matchBlockedRequestPolicy("/~private")).not.toBeNull();
    expect(matchBlockedRequestPolicy("/articles/1")).toBeNull();
  });

  test("rewrites html requests to the forbidden page", () => {
    const request = new NextRequest("https://example.com/@private", {
      headers: { accept: "text/html,application/xhtml+xml" },
    });
    const policy = blockedRequestPolicies[0];

    const response = createBlockedRequestResponse(request, policy);

    expect(response.status).toBe(403);
    expect(response.headers.get("x-middleware-rewrite")).toBe(
      "https://example.com/forbidden",
    );
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("X-Librerss-Firewall-Action")).toBe("block");
    expect(response.headers.get("X-Librerss-Firewall-Code")).toBe(policy.code);
    expect(response.headers.get("X-Robots-Tag")).toBe(
      "noindex, nofollow, noarchive",
    );
  });

  test("returns json errors for non-html blocked requests", async () => {
    const request = new NextRequest("https://example.com/@private", {
      headers: { accept: "application/json" },
    });
    const policy = blockedRequestPolicies[0];

    const response = createBlockedRequestResponse(request, policy);

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      code: policy.code,
      error: "Forbidden",
      message: policy.responseMessage,
    });
    expect(response.headers.get("x-middleware-rewrite")).toBeNull();
  });
});
