import { and, eq, isNull } from "drizzle-orm";
import { createHash, randomBytes } from "node:crypto";

import { CONFIG } from "@/lib";
import { getDb, signupInvitations, users } from "@/lib/db";

import { normalizeEmailInput } from "./credentials";
import { hashPassword } from "./session";

const INVITATION_TOKEN_BYTES = 32;
const INVITATION_TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,256}$/u;

/**
 * Represents a newly generated signup invitation. The plaintext token is only
 * available in this return value so administrators can copy the link once;
 * persistent storage receives only the token hash.
 */
export interface CreatedSignupInvitation {
  email: null | string;
  expiresAt: Date;
  token: string;
}

/**
 * Describes the options used to create a signup invitation.
 */
export interface CreateSignupInvitationOptions {
  createdByUserId: number;
  email?: null | string;
}

/**
 * Describes the options used to redeem a signup invitation into a user record.
 */
export interface RedeemSignupInvitationOptions {
  email: string;
  invitationToken: string;
  password: string;
}

/**
 * Describes the user created by invitation redemption.
 */
export interface SignupInvitationUser {
  email: string;
  id: number;
}

/**
 * Error thrown when an invitation cannot be redeemed safely.
 */
export class SignupInvitationError extends Error {
  /** Creates an invitation-specific error that maps to a safe public message. */
  constructor() {
    super("Invitation link is invalid or expired.");
    this.name = "SignupInvitationError";
  }
}

/**
 * Creates a secure invitation and stores only its token hash.
 * @param options - The admin and optional email binding for the invitation.
 * @returns The created invitation including the one-time plaintext token.
 */
export async function createSignupInvitation(
  options: CreateSignupInvitationOptions,
): Promise<CreatedSignupInvitation> {
  const email = normalizeOptionalInvitationEmail(options.email);
  const token = randomBytes(INVITATION_TOKEN_BYTES).toString("base64url");
  const tokenHash = hashSignupInvitationToken(token);
  const expiresAt = new Date(
    Date.now() + CONFIG.INVITATION_EXPIRATION_DAYS * 24 * 60 * 60 * 1000,
  );

  await getDb().insert(signupInvitations).values({
    createdByUserId: options.createdByUserId,
    email,
    expiresAt,
    tokenHash,
  });

  return { email, expiresAt, token };
}

/**
 * Returns whether a value has the shape of a generated invitation token.
 * @param token - Candidate token value from a request body or URL.
 * @returns Whether the token shape is acceptable for hashing and lookup.
 */
export function isValidSignupInvitationToken(token: string): boolean {
  return INVITATION_TOKEN_PATTERN.test(token);
}

/**
 * Redeems a valid invitation and creates the user in a single transaction.
 * @param options - The invited user's normalized signup details.
 * @returns The created user identity.
 */
export async function redeemSignupInvitation(
  options: RedeemSignupInvitationOptions,
): Promise<SignupInvitationUser> {
  if (!isValidSignupInvitationToken(options.invitationToken)) {
    throw new SignupInvitationError();
  }

  const tokenHash = hashSignupInvitationToken(options.invitationToken);
  const passwordHash = await hashPassword(options.password);

  return await getDb().transaction(async (tx) => {
    const invitations = await tx
      .select({
        email: signupInvitations.email,
        expiresAt: signupInvitations.expiresAt,
        id: signupInvitations.id,
      })
      .from(signupInvitations)
      .where(
        and(
          eq(signupInvitations.tokenHash, tokenHash),
          isNull(signupInvitations.consumedAt),
        ),
      )
      .limit(1)
      .for("update");

    if (invitations.length === 0) {
      throw new SignupInvitationError();
    }

    const invitation = invitations[0];
    if (invitation.expiresAt <= new Date()) {
      throw new SignupInvitationError();
    }

    if (invitation.email && invitation.email !== options.email) {
      throw new SignupInvitationError();
    }

    const createdUsers = await tx
      .insert(users)
      .values({ email: options.email, passwordHash })
      .returning({ email: users.email, id: users.id });
    if (createdUsers.length === 0) {
      throw new Error("Failed to create invited user");
    }

    const createdUser = createdUsers[0];

    await tx
      .update(signupInvitations)
      .set({ consumedAt: new Date(), consumedByUserId: createdUser.id })
      .where(eq(signupInvitations.id, invitation.id));

    return createdUser;
  });
}

/**
 * Converts a token to the persistent lookup hash used by the database.
 * @param token - The plaintext invitation token.
 * @returns The SHA-256 token digest encoded as lowercase hexadecimal.
 */
function hashSignupInvitationToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Normalizes an optional invitation email binding.
 * @param email - Optional email supplied by an administrator.
 * @returns The normalized email or null for an open invitation link.
 */
function normalizeOptionalInvitationEmail(email: null | string | undefined) {
  if (email === undefined || email === null) {
    return null;
  }

  const normalizedEmail = normalizeEmailInput(email);
  return normalizedEmail || null;
}
