import { envStringOptional, isDevelopment } from "@/lib";
import { normalizeEmailInput } from "@/lib/auth/credentials";
import { isValidEmail } from "@/lib/utils";

const DEV_AUTO_LOGIN_EMAIL_KEY = "DEV_AUTO_LOGIN_EMAIL";
const DEV_AUTO_LOGIN_PASSWORD_KEY = "DEV_AUTO_LOGIN_PASSWORD";

export const DEV_AUTO_LOGIN_ROUTE_PATH = "/api/auth/dev-login";
export const DEV_AUTO_LOGIN_FAILURE_QUERY_KEY = "devLogin";
export const DEV_AUTO_LOGIN_FAILURE_QUERY_VALUE = "failed";
export const DEV_AUTO_LOGIN_RETURN_TO_QUERY_KEY = "returnTo";

interface DevAutoLoginCredentials {
  email: string;
  password: string;
}

/** Builds the failure redirect used after an env-backed login attempt fails. */
export function buildDevAutoLoginFailurePath(pathname = "/dashboard"): string {
  const url = new URL(pathname, "http://localhost");
  url.searchParams.set(
    DEV_AUTO_LOGIN_FAILURE_QUERY_KEY,
    DEV_AUTO_LOGIN_FAILURE_QUERY_VALUE,
  );

  return `${url.pathname}${url.search}`;
}

/** Builds the same-origin request path for the development auto-login route. */
export function buildDevAutoLoginRequestPath(returnTo = "/dashboard"): string {
  const searchParams = new URLSearchParams({
    [DEV_AUTO_LOGIN_RETURN_TO_QUERY_KEY]: returnTo,
  });

  return `${DEV_AUTO_LOGIN_ROUTE_PATH}?${searchParams.toString()}`;
}

/**
 * Resolves the optional development-only auto-login credentials.
 *
 * The mode is off unless both env vars are present in development. Partial or
 * malformed configuration is treated as an explicit setup error so it fails
 * loudly instead of silently weakening auth expectations.
 */
export function getDevAutoLoginCredentials(): DevAutoLoginCredentials | null {
  if (!isDevelopment() || isPlaywrightRuntime()) {
    return null;
  }

  const rawEmail = envStringOptional(DEV_AUTO_LOGIN_EMAIL_KEY);
  const rawPassword = process.env[DEV_AUTO_LOGIN_PASSWORD_KEY];

  if (rawEmail === undefined && rawPassword === undefined) {
    return null;
  }

  if (rawEmail === undefined || rawPassword === undefined) {
    throw new Error(
      `${DEV_AUTO_LOGIN_EMAIL_KEY} and ${DEV_AUTO_LOGIN_PASSWORD_KEY} must both be set in development`,
    );
  }

  if (rawPassword.length === 0 || rawPassword.trim().length === 0) {
    throw new Error(
      `${DEV_AUTO_LOGIN_PASSWORD_KEY} must not be empty in development`,
    );
  }

  const email = normalizeEmailInput(rawEmail);

  if (!isValidEmail(email)) {
    throw new Error(
      `${DEV_AUTO_LOGIN_EMAIL_KEY} must contain a valid email address`,
    );
  }

  return {
    email,
    password: rawPassword,
  };
}

/** Returns whether the validated development auto-login mode is active. */
export function isDevAutoLoginEnabled(): boolean {
  return getDevAutoLoginCredentials() !== null;
}

/** Detects the dashboard query flag that suppresses auto-login retry loops. */
export function isDevAutoLoginFailure(value: string | string[] | undefined) {
  const normalized = Array.isArray(value) ? value[0] : value;
  return normalized === DEV_AUTO_LOGIN_FAILURE_QUERY_VALUE;
}

/**
 * Playwright runs against a dedicated ephemeral dev server and relies on the
 * unauthenticated dashboard contract in multiple e2e flows.
 */
function isPlaywrightRuntime(): boolean {
  const playwrightDistDir = process.env.PLAYWRIGHT_NEXT_DIST_DIR?.trim();
  if (playwrightDistDir !== undefined && playwrightDistDir !== "") {
    return true;
  }

  const playwrightPort = process.env.PLAYWRIGHT_PORT?.trim();
  return playwrightPort !== undefined && playwrightPort !== "";
}
