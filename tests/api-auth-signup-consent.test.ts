import { describe, expect, mock, test } from "bun:test";
import { NextRequest } from "next/server";

const baseSignupDeps = {
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
  redeemSignupInvitationFn: async () => ({
    email: "reader@example.com",
    id: 7,
  }),
  requireMutableRequestFn: () => null,
  runtimeFlags: {
    allowSignup: true,
    invitationsEnabled: true,
    usePlaceholderData: false,
  },
};

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
        ...baseSignupDeps,
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
        ...baseSignupDeps,
        setSessionCookieFn: setSessionCookie,
      },
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      user: { email: "reader@example.com", id: 7 },
    });
    expect(setSessionCookie).toHaveBeenCalledTimes(1);
  });

  test("POST returns a request guard response immediately", async () => {
    const { POST } = await import("@/app/api/auth/signup/route");
    const guardedResponse = new Response(JSON.stringify({ error: "blocked" }), {
      headers: { "content-type": "application/json" },
      status: 429,
    });

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
        ...baseSignupDeps,
        requireMutableRequestFn: () => guardedResponse,
      },
    );

    expect(response).toBe(guardedResponse);
  });

  test("POST rejects signup when server configuration disables it", async () => {
    const warn = mock(() => {});
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
        ...baseSignupDeps,
        logger: { error: () => {}, info: () => {}, warn },
        runtimeFlags: {
          allowSignup: false,
          invitationsEnabled: true,
          usePlaceholderData: false,
        },
      },
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "Signup is disabled by server configuration",
    });
    expect(warn).toHaveBeenCalledTimes(1);
  });

  test("POST creates an invited account when public signup is disabled", async () => {
    const redeemSignupInvitationFn = mock(async () => ({
      email: "reader@example.com",
      id: 9,
    }));
    const setSessionCookie = mock(() => {});
    const { POST } = await import("@/app/api/auth/signup/route");
    const invitationToken = "a".repeat(43);

    const response = await POST(
      new NextRequest("http://localhost/api/auth/signup", {
        body: JSON.stringify({
          acceptedLegalVersion: "2026-03-15",
          email: "reader@example.com",
          invitationToken,
          password: "ValidPass123!",
        }),
        headers: {
          "content-type": "application/json",
          "sec-fetch-site": "same-origin",
        },
        method: "POST",
      }),
      {
        ...baseSignupDeps,
        redeemSignupInvitationFn,
        runtimeFlags: {
          allowSignup: false,
          invitationsEnabled: true,
          usePlaceholderData: false,
        },
        setSessionCookieFn: setSessionCookie,
      },
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      user: { email: "reader@example.com", id: 9 },
    });
    expect(redeemSignupInvitationFn).toHaveBeenCalledWith({
      email: "reader@example.com",
      invitationToken,
      password: "ValidPass123!",
    });
    expect(setSessionCookie).toHaveBeenCalledTimes(1);
  });

  test("POST rejects malformed invitation tokens before redemption", async () => {
    const redeemSignupInvitationFn = mock(async () => ({
      email: "reader@example.com",
      id: 9,
    }));
    const { POST } = await import("@/app/api/auth/signup/route");

    const response = await POST(
      new NextRequest("http://localhost/api/auth/signup", {
        body: JSON.stringify({
          acceptedLegalVersion: "2026-03-15",
          email: "reader@example.com",
          invitationToken: "not a valid token",
          password: "ValidPass123!",
        }),
        headers: {
          "content-type": "application/json",
          "sec-fetch-site": "same-origin",
        },
        method: "POST",
      }),
      {
        ...baseSignupDeps,
        redeemSignupInvitationFn,
        runtimeFlags: {
          allowSignup: false,
          invitationsEnabled: true,
          usePlaceholderData: false,
        },
      },
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Invitation link is invalid or expired.",
    });
    expect(redeemSignupInvitationFn).not.toHaveBeenCalled();
  });

  test("POST rejects invitation signup when invitations are disabled", async () => {
    const redeemSignupInvitationFn = mock(async () => ({
      email: "reader@example.com",
      id: 9,
    }));
    const { POST } = await import("@/app/api/auth/signup/route");

    const response = await POST(
      new NextRequest("http://localhost/api/auth/signup", {
        body: JSON.stringify({
          acceptedLegalVersion: "2026-03-15",
          email: "reader@example.com",
          invitationToken: "a".repeat(43),
          password: "ValidPass123!",
        }),
        headers: {
          "content-type": "application/json",
          "sec-fetch-site": "same-origin",
        },
        method: "POST",
      }),
      {
        ...baseSignupDeps,
        redeemSignupInvitationFn,
        runtimeFlags: {
          allowSignup: false,
          invitationsEnabled: false,
          usePlaceholderData: false,
        },
      },
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "Invitations are disabled by server configuration",
    });
    expect(redeemSignupInvitationFn).not.toHaveBeenCalled();
  });

  test("POST rejects signup in placeholder mode", async () => {
    const warn = mock(() => {});
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
        ...baseSignupDeps,
        logger: { error: () => {}, info: () => {}, warn },
        runtimeFlags: {
          allowSignup: true,
          invitationsEnabled: true,
          usePlaceholderData: true,
        },
      },
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: "Signup is disabled when DATABASE_URL is not configured",
    });
    expect(warn).toHaveBeenCalledTimes(1);
  });

  test("POST returns parser errors for malformed JSON bodies", async () => {
    const { POST } = await import("@/app/api/auth/signup/route");

    const response = await POST(
      new NextRequest("http://localhost/api/auth/signup", {
        body: "not-json{{",
        headers: {
          "content-type": "application/json",
          "sec-fetch-site": "same-origin",
        },
        method: "POST",
      }),
      baseSignupDeps,
    );

    expect(response.status).toBe(400);
  });

  test("POST rejects invalid email addresses", async () => {
    const { POST } = await import("@/app/api/auth/signup/route");

    const response = await POST(
      new NextRequest("http://localhost/api/auth/signup", {
        body: JSON.stringify({
          acceptedLegalVersion: "2026-03-15",
          email: "not-an-email",
          password: "ValidPass123!",
        }),
        headers: {
          "content-type": "application/json",
          "sec-fetch-site": "same-origin",
        },
        method: "POST",
      }),
      baseSignupDeps,
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "A valid email is required",
    });
  });

  test("POST rejects weak passwords", async () => {
    const { POST } = await import("@/app/api/auth/signup/route");

    const response = await POST(
      new NextRequest("http://localhost/api/auth/signup", {
        body: JSON.stringify({
          acceptedLegalVersion: "2026-03-15",
          email: "reader@example.com",
          password: "weak",
        }),
        headers: {
          "content-type": "application/json",
          "sec-fetch-site": "same-origin",
        },
        method: "POST",
      }),
      baseSignupDeps,
    );

    expect(response.status).toBe(400);
  });

  test("POST hides existing-user signup attempts", async () => {
    const warn = mock(() => {});
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
        ...baseSignupDeps,
        getDbFn: () => ({
          insert: () => ({
            values: () => ({
              returning: () => Promise.resolve([]),
            }),
          }),
          select: () => ({
            from: () => ({
              where: () => ({
                limit: () => Promise.resolve([{ id: 1 }]),
              }),
            }),
          }),
        }),
        logger: { error: () => {}, info: () => {}, warn },
      },
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error:
        "Unable to create account. Please try a different email or contact support.",
    });
    expect(warn).toHaveBeenCalledTimes(1);
  });

  test("POST returns 500 when user creation does not return a record", async () => {
    const error = mock(() => {});
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
        ...baseSignupDeps,
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
        logger: { error, info: () => {}, warn: () => {} },
      },
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Failed to create account",
    });
    expect(error).toHaveBeenCalledTimes(1);
  });

  test("POST maps unique-constraint insert failures to a safe 400", async () => {
    const warn = mock(() => {});
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
        ...baseSignupDeps,
        getDbFn: () => ({
          insert: () => ({
            values: () => ({
              returning: () => Promise.reject(new Error("duplicate email")),
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
        isUniqueConstraintErrorFn: () => true,
        logger: { error: () => {}, info: () => {}, warn },
      },
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error:
        "Unable to create account. Please try a different email or contact support.",
    });
    expect(warn).toHaveBeenCalledTimes(1);
  });

  test("POST delegates unexpected failures to logAndRespondError", async () => {
    const delegatedResponse = new Response("delegated", { status: 500 });
    const logAndRespondErrorFn = mock(() => delegatedResponse);
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
        ...baseSignupDeps,
        hashPasswordFn: async () => {
          throw new Error("hash failed");
        },
        logAndRespondErrorFn,
      },
    );

    expect(response).toBe(delegatedResponse);
    expect(logAndRespondErrorFn).toHaveBeenCalledTimes(1);
  });
});
