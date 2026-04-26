import type { AuthSession, AuthUser } from "@/lib/core";

import { LEGAL_CONSENT_VERSION } from "@/lib";
import { getApiClient } from "@/lib/api/http";

/**
 * Describes the auth session response.
 */
interface AuthSessionResponse {
  user: AuthUser;
}

const authServiceBaseUrl = "/api/auth";

export const AuthService = {
  /**
   * Return the session.
   * @returns The session.
   */
  async getSession(): Promise<AuthSession> {
    const response = await getApiClient().get<AuthSession>(
      `${authServiceBaseUrl}/session`,
    );
    return response.data;
  },

  /**
   * Process the login.
   * @param email - The email.
   * @param password - The password.
   * @returns The login.
   */
  async login(email: string, password: string): Promise<AuthUser> {
    const response = await getApiClient().post<AuthSessionResponse>(
      `${authServiceBaseUrl}/login`,
      {
        email,
        password,
      },
    );
    return response.data.user;
  },

  /**
   * Process the logout.
   */
  async logout(): Promise<void> {
    await getApiClient().post(`${authServiceBaseUrl}/logout`);
  },

  /**
   * Process the signup.
   * @param email - The email.
   * @param password - The password.
   * @returns The signup.
   */
  async signup(email: string, password: string): Promise<AuthUser> {
    const response = await getApiClient().post<AuthSessionResponse>(
      `${authServiceBaseUrl}/signup`,
      {
        acceptedLegalVersion: LEGAL_CONSENT_VERSION,
        email,
        password,
      },
    );
    return response.data.user;
  },
};
