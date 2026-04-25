import { CONFIG } from "@/lib";

/**
 * Return whether is safe positive item id.
 * @param value - The value.
 * @returns Whether is safe positive item id.
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
 * Return whether is strong password.
 * @param password - The password.
 * @returns Whether is strong password.
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
 * Return whether is valid email.
 * @param email - The email.
 * @returns Whether is valid email.
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
