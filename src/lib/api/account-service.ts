import { getApiClient } from "./http";

const accountServiceBaseUrl = "/api/account";

export const AccountService = {
  async deleteAccount(): Promise<void> {
    await getApiClient().delete(accountServiceBaseUrl);
  },

  async exportAccountData(): Promise<Blob> {
    const response = await getApiClient().get<Blob>(
      `${accountServiceBaseUrl}/export`,
      {
        responseType: "blob",
      },
    );

    return response.data;
  },
};
