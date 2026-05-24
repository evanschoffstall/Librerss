import { getApiClient } from "@/lib/api/http";

const invitationServiceBaseUrl = "/api/invitations";

/** Describes the invitation link returned after admin generation. */
export interface CreatedInvitationLink {
  email: null | string;
  expiresAt: string;
  url: string;
}

export const InvitationService = {
  /**
   * Generate a one-time signup invitation link for an optional email address.
   * @param email - Optional invited email address that the token should be bound to.
   * @returns The generated invitation link and expiry metadata.
   */
  async createInvitation(email?: string): Promise<CreatedInvitationLink> {
    const response = await getApiClient().post<CreatedInvitationLink>(
      invitationServiceBaseUrl,
      { email },
    );

    return response.data;
  },
};
