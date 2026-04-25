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

/**
 * Build the dev auto login failure path.
 * @param pathname - The pathname.
 * @returns The dev auto login failure path.
 */
export function buildDevAutoLoginFailurePath(pathname = "/dashboard"): string {
  const url = new URL(pathname, "http://localhost");
  url.searchParams.set(
    DEV_AUTO_LOGIN_FAILURE_QUERY_KEY,
    DEV_AUTO_LOGIN_FAILURE_QUERY_VALUE,
  );

  return `${url.pathname}${url.search}`;
}

/**
 * Build the dev auto login request path.
 * @param returnTo - The return to.
 * @returns The dev auto login request path.
 */
export function buildDevAutoLoginRequestPath(returnTo = "/dashboard"): string {
  const searchParams = new URLSearchParams({
    [DEV_AUTO_LOGIN_RETURN_TO_QUERY_KEY]: returnTo,
  });

  return `${DEV_AUTO_LOGIN_ROUTE_PATH}?${searchParams.toString()}`;
}

/**
 * Return the dev auto login credentials.
 * @returns The dev auto login credentials.
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

/**
 * Return whether is dev auto login enabled.
 * @returns Whether is dev auto login enabled.
 */
export function isDevAutoLoginEnabled(): boolean {
  return getDevAutoLoginCredentials() !== null;
}

/**
 * Return whether is dev auto login failure.
 * @param value - The value.
 * @returns Whether is dev auto login failure.
 */
export function isDevAutoLoginFailure(value: string | string[] | undefined) {
  const normalized = Array.isArray(value) ? value[0] : value;
  return normalized === DEV_AUTO_LOGIN_FAILURE_QUERY_VALUE;
}

/**
 * Return whether is playwright runtime.
 * @returns Whether is playwright runtime.
 */
function isPlaywrightRuntime(): boolean {
  const playwrightDistDir = process.env.PLAYWRIGHT_NEXT_DIST_DIR?.trim();
  if (playwrightDistDir !== undefined && playwrightDistDir !== "") {
    return true;
  }

  const playwrightPort = process.env.PLAYWRIGHT_PORT?.trim();
  return playwrightPort !== undefined && playwrightPort !== "";
}
