import { envBooleanOptional } from "@/lib/config";

/**
 * Generates a stable-format placeholder session token without importing Node
 * builtins into client-reachable code.
 *
 * The placeholder runtime module can be pulled into the dashboard dependency
 * graph during development builds, so this helper must work in both browser
 * and server compilation contexts. Web Crypto is available in modern Node and
 * browsers, which keeps the token generation cryptographically strong without
 * requiring a `node:crypto` import.
 * @returns A 32-byte random token encoded as 64 lowercase hexadecimal characters.
 */
function createPlaceholderSessionToken() {
  const tokenBytes = new Uint8Array(32);

  crypto.getRandomValues(tokenBytes);

  return Array.from(tokenBytes, (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

export const RUNTIME_FLAGS = {
  /**
   * Returns whether signup should be available in the current runtime.
   * @returns Whether signup is enabled.
   */
  get allowSignup() {
    return envBooleanOptional("ALLOW_SIGNUP", false);
  },
  /**
   * Returns whether the runtime has a configured database connection string.
   * @returns Whether DATABASE_URL is present.
   */
  get hasDatabaseUrl() {
    return Boolean(process.env.DATABASE_URL?.trim());
  },
  /**
   * Returns whether secure invitation links may be issued and redeemed.
   * @returns Whether invitation support is enabled.
   */
  get invitationsEnabled() {
    return envBooleanOptional("INVITATIONS_ENABLED", true);
  },
  /**
   * Returns whether the app should serve placeholder data instead of live data.
   * @returns Whether placeholder mode is active.
   */
  get usePlaceholderData() {
    return !this.hasDatabaseUrl;
  },
} as const;

// SECURITY: The placeholder session token is generated fresh on every process
// start so it is never a static, publicly-known credential.  The old hardcoded
// value "librerss-placeholder-admin-session" was committed to version control
// and could be used directly as a cookie by anyone who read the source code.
//
// In placeholder/demo mode (no DATABASE_URL), users still need to log in with
// the placeholder credentials; the server then issues this per-process token.
// Restarting the server invalidates all placeholder sessions, which is
// acceptable for dev/demo usage.
export const PLACEHOLDER_ADMIN_USER = {
  email: "admin@admin.com" as const,
  id: 0 as const,
  isAdmin: true as const,
  passwordHash:
    "placeholder-admin-salt:fa68d3bb667b1689527c99821adac9c2e02910bfa20e34bfc0a9a5a6c239edc80ae30f8b59dd6c37cebc0d6919b26ae68848cb0e56cbf81108e43327765bfeb2" as const,
  // Cryptographically random per-process token — never a hardcoded constant.
  sessionToken: createPlaceholderSessionToken(),
} as const;
