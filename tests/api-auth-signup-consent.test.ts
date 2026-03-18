import { describe, expect, mock, test } from "bun:test";
import { NextRequest } from "next/server";

describe("auth signup legal consent", () => {
  test("POST rejects signup without the current legal acceptance version", async () => {
    const { POST } = await import("@/app/api/auth/signup/route");
    const response = await POST(
      new NextRequest("http://localhost/api/auth/signup", {
        body: JSON.stringify({
          email: "reader@example.com",
          password: "ValidPass123!",
        }),
        headers: {
          "content-type": "application/json",
          "sec-fetch-site": "same-origin",
        },
        method: "POST",
      }),
      {
        getDbFn: () => ({
          insert: () => ({
            values: () => ({
              returning: () => Promise.resolve([]),
            }),
          }),
          select: () => ({
            from: () => ({
              where: () => ({
                limit: () => Promise.resolve([]),
              }),
            }),
          }),
        }),
        logAndRespondErrorFn: () => new Response("error", { status: 500 }),
        logger: { error: () => {}, info: () => {}, warn: () => {} },
        requireMutableRequestFn: () => null,
        runtimeFlags: { allowSignup: true, usePlaceholderData: false },
      },
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error:
        "You must accept the current privacy policy and terms for this deployment before creating an account.",
    });
  });

  test("POST creates the account when the current legal acceptance version is present", async () => {
    const setSessionCookie = mock(() => {});

    const { POST } = await import("@/app/api/auth/signup/route");
    const response = await POST(
      new NextRequest("http://localhost/api/auth/signup", {
        body: JSON.stringify({
          acceptedLegalVersion: "2026-03-15",
          email: "reader@example.com",
          password: "ValidPass123!",
        }),
        headers: {
          "content-type": "application/json",
          "sec-fetch-site": "same-origin",
        },
        method: "POST",
      }),
      {
        createSessionFn: async () => "session-token",
        getDbFn: () => ({
          insert: () => ({
            values: () => ({
              returning: () =>
                Promise.resolve([{ email: "reader@example.com", id: 7 }]),
            }),
          }),
          select: () => ({
            from: () => ({
              where: () => ({
                limit: () => Promise.resolve([]),
              }),
            }),
          }),
        }),
        hashPasswordFn: async () => "hashed-password",
        isUniqueConstraintErrorFn: () => false,
        logAndRespondErrorFn: () => new Response("error", { status: 500 }),
        logger: { error: () => {}, info: () => {}, warn: () => {} },
        requireMutableRequestFn: () => null,
        runtimeFlags: { allowSignup: true, usePlaceholderData: false },
        setSessionCookieFn: setSessionCookie,
      },
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      user: { email: "reader@example.com", id: 7 },
    });
    expect(setSessionCookie).toHaveBeenCalledTimes(1);
  });
});