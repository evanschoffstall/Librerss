import { getApiClient } from "./http";

import type { AuthSession, AuthUser } from "@/lib/core/types";

interface AuthSessionResponse {
  user: AuthUser;
}

const authServiceBaseUrl = "/api/auth";

export const AuthService = {
  async getSession(): Promise<AuthSession> {
    const response = await getApiClient().get<AuthSession>(
      `${authServiceBaseUrl}/session`,
    );
    return response.data;
  },

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

  async logout(): Promise<void> {
    await getApiClient().post(`${authServiceBaseUrl}/logout`);
  },

  async signup(email: string, password: string): Promise<AuthUser> {
    const response = await getApiClient().post<AuthSessionResponse>(
      `${authServiceBaseUrl}/signup`,
      {
        email,
        password,
      },
    );
    return response.data.user;
  },
};
