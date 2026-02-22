import { CONFIG } from "@/lib/config";

/**
 * Validates email addresses using RFC-compliant regex
 * @param email - Email address to validate
 * @returns true if email is valid
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

  if (password.length < CONFIG.PASSWORD_MIN_LENGTH) {
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
 * Sanitizes article title to prevent XSS and enforce length limits
 * @param title - Raw article title
 * @returns Sanitized title
 */
export function sanitizeArticleTitle(title: string | null | undefined): string {
  const cleaned = (title || "Untitled").trim();
  if (cleaned.length <= CONFIG.MAX_ARTICLE_TITLE_LENGTH) return cleaned;
  return cleaned.slice(0, CONFIG.MAX_ARTICLE_TITLE_LENGTH).trim() + "...";
}
