import { CONFIG } from "@/lib";

/**
 * Type guard: returns true if value is a safe positive integer suitable as a
 * database row id. Shared by server-side article-status logic and client-side
 * feed management helpers.
 */
export function isSafePositiveItemId(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value > 0 &&
    value <= Number.MAX_SAFE_INTEGER
  );
}

/**
 * Validates password strength
 * Requires minimum length and complexity (3 of 4 character types)
 * @param password - Password to validate
 * @returns true if password meets strength requirements
 */
export function isStrongPassword(password: string): boolean {
  if (!password || typeof password !== "string") {
    return false;
  }

  // SECURITY: Reject overlong passwords to prevent scrypt DoS.
  if (
    password.length < CONFIG.PASSWORD_MIN_LENGTH ||
    password.length > CONFIG.PASSWORD_MAX_LENGTH
  ) {
    return false;
  }

  const hasUpperCase = /[A-Z]/.test(password);
  const hasLowerCase = /[a-z]/.test(password);
  const hasNumber = /\d/.test(password);
  const hasSpecial = /[!@#$%^&*(),.?":{}|<>[\]\\/'`~;_\-+=]/.test(password);

  // Require at least 3 of 4 character types
  const complexityCount = [
    hasUpperCase,
    hasLowerCase,
    hasNumber,
    hasSpecial,
  ].filter(Boolean).length;

  return complexityCount >= CONFIG.PASSWORD_COMPLEXITY_REQUIRED_TYPES;
}

/**
 * Validates email addresses using a simplified RFC 5322 regex.
 */
export function isValidEmail(email: string): boolean {
  if (!email || typeof email !== "string") {
    return false;
  }

  // RFC 5322 simplified regex
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  return (
    emailRegex.test(email) &&
    email.length > 0 &&
    email.length <= CONFIG.MAX_EMAIL_LENGTH
  );
}
