import { randomBytes } from "node:crypto";

const parseBooleanEnv = (value: string | undefined, fallback: boolean) => {
  if (typeof value !== "string") {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();

  if (["true", "1", "yes", "on"].includes(normalized)) {
    return true;
  }

  if (["false", "0", "no", "off"].includes(normalized)) {
    return false;
  }

  return fallback;
};

export const RUNTIME_FLAGS = {
  get hasDatabaseUrl() {
    return Boolean(process.env.DATABASE_URL?.trim());
  },
  get usePlaceholderData() {
    return !this.hasDatabaseUrl;
  },
  get allowPlaceholderAuth() {
    const enabled = parseBooleanEnv(
      process.env.ALLOW_PLACEHOLDER_AUTH,
      process.env.NODE_ENV !== "production",
    );
    // SECURITY: Emit a loud warning when placeholder auth is active in
    // production.  The placeholder session token is process-scoped and
    // randomly generated (see below), but it still bypasses the database and
    // provides admin access with a well-known credential set.
    if (enabled && process.env.NODE_ENV === "production") {
      console.warn(
        "[security] ALLOW_PLACEHOLDER_AUTH is enabled in production. " +
          "This grants admin access without a database. " +
          "Set DATABASE_URL and disable ALLOW_PLACEHOLDER_AUTH for production deployments.",
      );
    }
    return enabled;
  },
  get allowSignup() {
    return parseBooleanEnv(process.env.ALLOW_SIGNUP, true);
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
  id: 0 as const,
  email: "admin@admin.com" as const,
  passwordHash:
    "placeholder-admin-salt:fa68d3bb667b1689527c99821adac9c2e02910bfa20e34bfc0a9a5a6c239edc80ae30f8b59dd6c37cebc0d6919b26ae68848cb0e56cbf81108e43327765bfeb2" as const,
  // Cryptographically random per-process token — never a hardcoded constant.
  sessionToken: randomBytes(32).toString("hex"),
} as const;
