import { afterEach, describe, expect, mock, test } from "bun:test";
import { NextRequest } from "next/server";

const createSignupInvitationMock = mock();
const requireMutableAuthenticatedUserMock = mock();
const logAndRespondErrorMock = mock(
  () => new Response("error", { status: 500 }),
);

/** Builds a same-origin JSON POST request for invitation creation tests. */
function createInvitationRequest(body: Record<string, unknown>) {
  return new NextRequest("https://reader.example.com/api/invitations", {
    body: JSON.stringify(body),
    headers: {
      "content-type": "application/json",
      "sec-fetch-site": "same-origin",
    },
    method: "POST",
  });
}

/** Loads the invitations route with isolated mocks for each security case. */
async function loadInvitationsRoute() {
  createSignupInvitationMock.mockImplementation(async () => ({
    email: "invited@example.com",
    expiresAt: new Date("2026-06-06T00:00:00.000Z"),
    token: "secure-token",
  }));
  requireMutableAuthenticatedUserMock.mockImplementation(async () => ({
    email: "admin@example.com",
    expiresAt: new Date("2026-06-01T00:00:00.000Z"),
    isAdmin: true,
    sessionId: 1,
    userId: 42,
  }));
  mock.module("@/lib/auth", () => ({
    createSignupInvitation: createSignupInvitationMock,
  }));
  mock.module("@/lib/core/placeholder", () => ({
    RUNTIME_FLAGS: {
      invitationsEnabled: true,
      usePlaceholderData: false,
    },
  }));
  mock.module("@/lib/server", () => ({
    serverApi: {
      logAndRespondError: logAndRespondErrorMock,
      requireMutableAuthenticatedUser: requireMutableAuthenticatedUserMock,
    },
  }));

  return await import(
    `@/app/api/invitations/route?test=${Date.now()}-${Math.random()}`
  );
}

afterEach(() => {
  mock.restore();
  createSignupInvitationMock.mockReset();
  requireMutableAuthenticatedUserMock.mockReset();
  logAndRespondErrorMock.mockReset();
});

describe("invitation API", () => {
  test("POST creates a one-time invitation link for configured admins", async () => {
    const { POST } = await loadInvitationsRoute();
    const response = await POST(
      createInvitationRequest({ email: "invited@example.com" }),
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      email: "invited@example.com",
      expiresAt: "2026-06-06T00:00:00.000Z",
      url: "https://reader.example.com/dashboard?invite=secure-token",
    });
    expect(requireMutableAuthenticatedUserMock).toHaveBeenCalledWith(
      expect.any(NextRequest),
      {
        rateLimit: {
          key: "invitations",
          maxAttempts: 20,
          scope: "user",
          windowMs: 3_600_000,
        },
      },
    );
    expect(createSignupInvitationMock).toHaveBeenCalledWith({
      createdByUserId: 42,
      email: "invited@example.com",
    });
  });

  test("POST rejects non-admin users before creating an invitation", async () => {
    const { POST } = await loadInvitationsRoute();
    requireMutableAuthenticatedUserMock.mockResolvedValue({
      email: "reader@example.com",
      expiresAt: new Date("2026-06-01T00:00:00.000Z"),
      isAdmin: false,
      sessionId: 1,
      userId: 41,
    });
    const response = await POST(createInvitationRequest({}));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "Forbidden" });
    expect(createSignupInvitationMock).not.toHaveBeenCalled();
  });

  test("POST validates optional invitation email input", async () => {
    const { POST } = await loadInvitationsRoute();
    const response = await POST(
      createInvitationRequest({ email: "bad-email" }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "A valid invitation email is required",
    });
    expect(createSignupInvitationMock).not.toHaveBeenCalled();
  });
});
