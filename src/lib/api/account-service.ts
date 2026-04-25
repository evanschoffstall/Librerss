import { getApiClient } from "@/lib/api/http";

const accountServiceBaseUrl = "/api/account";

export const AccountService = {
  /**
   * Process the delete account.
   */
  async deleteAccount(): Promise<void> {
    await getApiClient().delete(accountServiceBaseUrl);
  },

  /**
   * Process the export account data.
   * @returns The export account data.
   */
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
