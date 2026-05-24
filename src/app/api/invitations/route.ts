import type { NextRequest } from "next/server";

import { NextResponse } from "next/server";

import { CONFIG, logger } from "@/lib";
import { jsonError, parseJsonObjectBodyOrResponse } from "@/lib/api/http";
import { createSignupInvitation } from "@/lib/auth";
import { RUNTIME_FLAGS } from "@/lib/core/placeholder";
import { serverApi } from "@/lib/server";
import { isValidEmail } from "@/lib/utils";

/**
 * Describes the invitation creator auth result.
 */
type InvitationUser = Awaited<
  ReturnType<typeof serverApi.requireMutableAuthenticatedUser>
>;

/**
 * Handle invitation link creation for configured site administrators.
 * @param request - Incoming admin request.
 * @returns A one-time invitation link response or a safe error response.
 */
export async function POST(request: NextRequest): Promise<Response> {
  try {
    const user = await requireInvitationCreator(request);
    if (user instanceof Response) {
      return user;
    }

    const authorizationError = resolveInvitationAuthorizationError(
      user.isAdmin,
    );
    if (authorizationError) {
      return authorizationError;
    }

    const body = await parseJsonObjectBodyOrResponse(request);
    if (body instanceof Response) {
      return body;
    }

    const email = parseOptionalInvitationEmail(body.email);
    if (email instanceof Response) {
      return email;
    }

    return await createInvitationResponse(request, user, email);
  } catch (error) {
    return serverApi.logAndRespondError("Invitation creation error", error);
  }
}

/**
 * Create the invitation and response payload.
 * @param request - Incoming admin request.
 * @param user - The authorized invitation creator.
 * @param email - Optional normalized email binding.
 * @returns The invitation creation response.
 */
async function createInvitationResponse(
  request: NextRequest,
  user: Exclude<InvitationUser, Response>,
  email: null | string,
): Promise<Response> {
  const invitation = await createSignupInvitation({
    createdByUserId: user.userId,
    email,
  });
  const invitationUrl = new URL("/dashboard", request.url);
  invitationUrl.searchParams.set("invite", invitation.token);

  logger.info("Signup invitation created", {
    createdByUserId: user.userId,
    emailBound: Boolean(invitation.email),
  });

  return NextResponse.json(
    {
      email: invitation.email,
      expiresAt: invitation.expiresAt.toISOString(),
      url: invitationUrl.toString(),
    },
    { status: 201 },
  );
}

/**
 * Parse and validate the optional email binding from the request body.
 * @param email - Candidate email binding supplied by an administrator.
 * @returns A trimmed email, null, or a validation response.
 */
function parseOptionalInvitationEmail(
  email: unknown,
): null | Response | string {
  if (email === undefined || email === null) {
    return null;
  }

  if (typeof email !== "string") {
    return jsonError("Invitation email must be a string", 400);
  }

  const trimmedEmail = email.trim().toLowerCase();
  if (!trimmedEmail) {
    return null;
  }

  if (!isValidEmail(trimmedEmail)) {
    return jsonError("A valid invitation email is required", 400);
  }

  return trimmedEmail;
}

/**
 * Require an authenticated mutable user for invitation creation.
 * @param request - Incoming admin request.
 * @returns The authenticated user or an auth/rate-limit response.
 */
async function requireInvitationCreator(
  request: NextRequest,
): Promise<InvitationUser> {
  return serverApi.requireMutableAuthenticatedUser(request, {
    rateLimit: {
      key: "invitations",
      maxAttempts: CONFIG.RATE_LIMIT_INVITATIONS_MAX_ATTEMPTS,
      scope: "user",
      windowMs: CONFIG.RATE_LIMIT_INVITATIONS_WINDOW_MS,
    },
  });
}

/**
 * Resolve whether the authenticated user may create invitation links.
 * @param isAdmin - Whether the authenticated user is persisted as an admin.
 * @returns A safe error response when invitation generation is not allowed.
 */
function resolveInvitationAuthorizationError(
  isAdmin: boolean,
): null | Response {
  if (!RUNTIME_FLAGS.invitationsEnabled) {
    return jsonError("Invitations are disabled by server configuration", 403);
  }

  if (!isAdmin) {
    return jsonError("Forbidden", 403);
  }

  if (RUNTIME_FLAGS.usePlaceholderData) {
    return jsonError("Invitations require a configured database", 503);
  }

  return null;
}
