import { NextRequest, NextResponse } from "next/server";

import { CONFIG, logger } from "@/lib";
import { jsonError, parseJsonObjectBodyOrResponse } from "@/lib/api/http";
import {
  authenticateCredentials,
  normalizeEmailInput,
  setSessionCookie,
} from "@/lib/auth";
import { serverApi } from "@/lib/server";
import { isValidEmail } from "@/lib/utils";

interface LoginPayload {
  email: string;
  password: string;
}

/**
 * Render the post component.
 * @param request - The request.
 * @returns The rendered post component.
 */
export async function POST(request: NextRequest) {
  try {
    const requestError = serverApi.requireMutableRequest(request, {
      rateLimit: {
        key: "login",
        maxAttempts: CONFIG.RATE_LIMIT_LOGIN_MAX_ATTEMPTS,
        windowMs: CONFIG.RATE_LIMIT_LOGIN_WINDOW_MS,
      },
    });
    if (requestError) {
      return requestError;
    }

    const payloadOrResponse = await parseJsonObjectBodyOrResponse(request);
    if (payloadOrResponse instanceof Response) {
      return payloadOrResponse;
    }

    const parsedPayload = parseLoginPayload(payloadOrResponse);
    if (parsedPayload instanceof Response) {
      return parsedPayload;
    }
    const { email, password } = parsedPayload;

    const result = await authenticateCredentials(email, password);
    if (!result.ok) {
      return respondInvalidCredentials();
    }

    const info =
      typeof logger.info === "function" ? logger.info.bind(logger) : undefined;
    info?.("User logged in successfully", {
      email: result.email,
      userId: result.userId,
    });

    const response = NextResponse.json({
      user: { email: result.email, id: result.userId },
    });
    setSessionCookie(response, result.token);

    return response;
  } catch (error) {
    return serverApi.logAndRespondError("Login error", error);
  }
}

/**
 * Parse the login payload.
 * @param payload - The payload.
 * @returns The login payload.
 */
function parseLoginPayload(
  payload: Record<string, unknown>,
): LoginPayload | Response {
  const warn =
    typeof logger.warn === "function" ? logger.warn.bind(logger) : undefined;
  const email = normalizeEmailInput(payload.email);
  const password = payload.password;

  if (!email || !isValidEmail(email)) {
    warn?.("Login attempt with invalid email");
    return jsonError("A valid email is required", 400);
  }

  if (typeof password !== "string" || password.length === 0) {
    return jsonError("Password is required", 400);
  }

  if (password.length > CONFIG.PASSWORD_MAX_LENGTH) {
    return jsonError("Invalid email or password", 401);
  }

  return { email, password };
}

/**
 * Process the respond invalid credentials.
 * @returns The respond invalid credentials.
 */
function respondInvalidCredentials(): Response {
  const warn =
    typeof logger.warn === "function" ? logger.warn.bind(logger) : undefined;
  warn?.("Failed login attempt");
  return jsonError("Invalid email or password", 401);
}
