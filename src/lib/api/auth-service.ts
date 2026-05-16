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
   * Fetch the current authenticated session from the server.
   * @returns The active session data including user identity.
   */
  async getSession(): Promise<AuthSession> {
    const response = await getApiClient().get<AuthSession>(
      `${authServiceBaseUrl}/session`,
    );
    return response.data;
  },

  /**
   * Authenticate a user with email and password credentials.
   * @param email - The user's email address.
   * @param password - The user's plaintext password.
   * @returns The authenticated user object on success.
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
   * Terminate the current session and clear server-side auth state.
   */
  async logout(): Promise<void> {
    await getApiClient().post(`${authServiceBaseUrl}/logout`);
  },

  /**
   * Create a new account and authenticate the user.
   * @param email - The new account's email address.
   * @param password - The new account's plaintext password.
   * @returns The newly created and authenticated user object.
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
