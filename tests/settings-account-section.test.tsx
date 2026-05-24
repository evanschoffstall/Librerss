import { fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { toast } from "sonner";

import { SettingsAccountSection } from "@/app/dashboard/dashboard-components/settings-dialog/SettingsAccountSection";
import { AccountService, InvitationService } from "@/lib/api";

const originalConfirm = window.confirm;
const originalCreateObjectUrl = URL.createObjectURL;
const originalRevokeObjectUrl = URL.revokeObjectURL;
const originalDeleteAccount = AccountService.deleteAccount;
const originalExportAccountData = AccountService.exportAccountData;
const originalCreateInvitation = InvitationService.createInvitation;
const originalToastSuccess = toast.success;
const originalToastError = toast.error;
let originalAnchorClick: (() => void) | undefined;

beforeEach(() => {
  Object.defineProperty(window, "confirm", {
    configurable: true,
    value: mock(() => true),
  });
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: mock(() => "blob:account-export"),
  });
  Object.defineProperty(URL, "revokeObjectURL", {
    configurable: true,
    value: mock(() => {}),
  });
  Object.defineProperty(window.HTMLAnchorElement.prototype, "click", {
    configurable: true,
    value: mock(() => {}),
  });
  originalAnchorClick ??= window.HTMLAnchorElement?.prototype.click;
  AccountService.deleteAccount = mock(async () => {});
  AccountService.exportAccountData = mock(async () => new Blob(["{}"]));
  InvitationService.createInvitation = mock(async () => ({
    email: "invited@example.com",
    expiresAt: "2026-06-06T00:00:00.000Z",
    url: "http://localhost/dashboard?invite=token",
  }));
  toast.success = mock(() => "success");
  toast.error = mock(() => "error");
});

afterEach(() => {
  Object.defineProperty(window, "confirm", {
    configurable: true,
    value: originalConfirm,
  });
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: originalCreateObjectUrl,
  });
  Object.defineProperty(URL, "revokeObjectURL", {
    configurable: true,
    value: originalRevokeObjectUrl,
  });
  if (originalAnchorClick) {
    Object.defineProperty(window.HTMLAnchorElement.prototype, "click", {
      configurable: true,
      value: originalAnchorClick,
    });
  }
  AccountService.deleteAccount = originalDeleteAccount;
  AccountService.exportAccountData = originalExportAccountData;
  InvitationService.createInvitation = originalCreateInvitation;
  toast.success = originalToastSuccess;
  toast.error = originalToastError;
});

describe("SettingsAccountSection", () => {
  test("generates and copies invitation links for invitation admins", async () => {
    const originalClipboard = navigator.clipboard;
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: mock(async () => {}) },
    });

    try {
      const { getByLabelText, getByRole } = render(
        <SettingsAccountSection
          canManageInvitations
          onAccountDeleted={mock()}
        />,
      );

      const invitationEmailInput = getByLabelText("Invitation email");
      fireEvent.input(invitationEmailInput, {
        target: { value: "invited@example.com" },
      });
      await waitFor(() => {
        expect(invitationEmailInput).toHaveProperty(
          "value",
          "invited@example.com",
        );
      });
      fireEvent.click(getByRole("button", { name: "Generate Link" }));

      await waitFor(() => {
        expect(InvitationService.createInvitation).toHaveBeenCalledWith(
          "invited@example.com",
        );
        expect(toast.success).toHaveBeenCalledWith(
          "Invitation link generated.",
        );
      });

      expect(getByLabelText("Generated invitation link")).toHaveProperty(
        "value",
        "http://localhost/dashboard?invite=token",
      );

      fireEvent.click(getByRole("button", { name: "Copy" }));

      await waitFor(() => {
        expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
          "http://localhost/dashboard?invite=token",
        );
        expect(toast.success).toHaveBeenCalledWith("Invitation link copied.");
      });
    } finally {
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: originalClipboard,
      });
    }
  });

  test("exports account data and deletes the account after confirmation", async () => {
    const onAccountDeleted = mock(() => {});
    const { getByRole, getByText } = render(
      <SettingsAccountSection onAccountDeleted={onAccountDeleted} />,
    );

    expect(getByText("Privacy Policy")).toBeTruthy();
    expect(getByText("Terms of Use")).toBeTruthy();

    fireEvent.click(getByRole("button", { name: "Export Data" }));

    await waitFor(() => {
      expect(AccountService.exportAccountData).toHaveBeenCalled();
      expect(URL.createObjectURL).toHaveBeenCalled();
      expect(window.HTMLAnchorElement.prototype.click).toHaveBeenCalled();
      expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:account-export");
      expect(toast.success).toHaveBeenCalledWith("Account export downloaded.");
    });

    fireEvent.click(getByRole("button", { name: "Delete Account" }));

    await waitFor(() => {
      expect(window.confirm).toHaveBeenCalled();
      expect(AccountService.deleteAccount).toHaveBeenCalled();
      expect(onAccountDeleted).toHaveBeenCalled();
      expect(toast.success).toHaveBeenCalledWith("Account deleted.");
    });
  });

  test("handles export and delete failures and respects delete cancellation", async () => {
    const onAccountDeleted = mock(() => {});
    AccountService.exportAccountData = mock(async () => {
      throw new Error("export failed");
    });
    AccountService.deleteAccount = mock(async () => {
      throw new Error("delete failed");
    });
    Object.defineProperty(window, "confirm", {
      configurable: true,
      value: mock(() => false),
    });

    const { getByRole, rerender } = render(
      <SettingsAccountSection onAccountDeleted={onAccountDeleted} />,
    );

    fireEvent.click(getByRole("button", { name: "Export Data" }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        "Unable to export account data.",
      );
    });

    fireEvent.click(getByRole("button", { name: "Delete Account" }));

    expect(AccountService.deleteAccount).not.toHaveBeenCalled();
    expect(onAccountDeleted).not.toHaveBeenCalled();

    Object.defineProperty(window, "confirm", {
      configurable: true,
      value: mock(() => true),
    });
    rerender(<SettingsAccountSection onAccountDeleted={onAccountDeleted} />);

    fireEvent.click(getByRole("button", { name: "Delete Account" }));

    await waitFor(() => {
      expect(AccountService.deleteAccount).toHaveBeenCalled();
      expect(toast.error).toHaveBeenCalledWith("Unable to delete the account.");
    });

    expect(onAccountDeleted).not.toHaveBeenCalled();
  });
});
