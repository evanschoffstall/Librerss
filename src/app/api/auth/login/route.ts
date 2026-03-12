import { NextRequest, NextResponse } from "next/server";

import { jsonError, parseJsonObjectBodyOrResponse } from "@/lib/api/http";
import { normalizeEmailInput } from "@/lib/auth/credentials";
import { authenticateCredentials, setSessionCookie } from "@/lib/auth/session";
import { CONFIG } from "@/lib/config";
import { logger } from "@/lib/logger";
import { logAndRespondError, requireMutableRequest } from "@/lib/server";
import { isValidEmail } from "@/lib/utils/validation";

interface LoginPayload {
  email: string;
  password: string;
}

export async function POST(request: NextRequest) {
  try {
    const requestError = requireMutableRequest(request, {
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

    logger.info("User logged in successfully", {
      email: result.email,
      userId: result.userId,
    });

    const response = NextResponse.json({
      user: { email: result.email, id: result.userId },
    });
    setSessionCookie(response, result.token);

    return response;
  } catch (error) {
    return logAndRespondError("Login error", error);
  }
}

function parseLoginPayload(
  payload: Record<string, unknown>,
): LoginPayload | Response {
  const email = normalizeEmailInput(payload.email);
  const password = payload.password;

  if (!email || !isValidEmail(email)) {
    logger.warn("Login attempt with invalid email");
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

function respondInvalidCredentials(): Response {
  logger.warn("Failed login attempt");
  return jsonError("Invalid email or password", 401);
}
