"use client";

import { Copy, Download, FileText, Link2, Shield, Trash2 } from "lucide-react";
import Link from "next/link";
import { type ReactNode, useRef, useState } from "react";
import { toast } from "sonner";

import { MotionSpinner } from "@/app/dashboard/dashboard-components/status";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { AccountService, InvitationService } from "@/lib/api";
import { clearClientOriginState } from "@/lib/browser";

/**
 * Describes the props for the settings account action row component.
 */
interface SettingsAccountActionRowProps {
  action: ReactNode;
  description: string;
  title: ReactNode;
}

/**
 * Describes the props for the account delete row.
 */
interface SettingsAccountDeleteRowProps {
  isDeleting: boolean;
  isDisabled: boolean;
  onDelete: () => void;
}

/**
 * Describes the props for the account export row.
 */
interface SettingsAccountExportRowProps {
  isDisabled: boolean;
  isExporting: boolean;
  onExport: () => Promise<void>;
}

/**
 * Describes the props for the settings account policy link component.
 */
interface SettingsAccountPolicyLinkProps {
  href: string;
  label: string;
}

/**
 * Describes the props for the settings account section component.
 */
interface SettingsAccountSectionProps {
  canManageInvitations?: boolean;
  onAccountDeleted: () => void;
}

/**
 * Describes the props for the invitation admin section.
 */
interface SettingsInvitationAdminSectionProps {
  isVisible: boolean;
}

/**
 * Describes the props for the invitation generation button.
 */
interface SettingsInvitationGenerateButtonProps {
  isGenerating: boolean;
  onGenerate: () => Promise<void>;
}

/**
 * Describes the props for the generated invitation result.
 */
interface SettingsInvitationResultProps {
  invitationUrl: string;
  onCopy: () => Promise<void>;
}

/**
 * Render the settings account section component.
 * @param props - The component props.
 * @returns The rendered settings account section component.
 */
export function SettingsAccountSection(props: SettingsAccountSectionProps) {
  const { canManageInvitations = false, onAccountDeleted } = props;
  const { handleDeleteActionClick, handleExport, isDeleting, isExporting } =
    useSettingsAccountActions(onAccountDeleted);

  return (
    <section className="space-y-4 rounded-lg border bg-card p-4">
      <SettingsAccountHeader />
      <Separator />
      <SettingsInvitationAdminSection isVisible={canManageInvitations} />
      <SettingsAccountExportRow
        isDisabled={isExporting || isDeleting}
        isExporting={isExporting}
        onExport={handleExport}
      />
      <Separator />
      <SettingsAccountDeleteRow
        isDeleting={isDeleting}
        isDisabled={isDeleting || isExporting}
        onDelete={handleDeleteActionClick}
      />
    </section>
  );
}

/**
 * Render the settings account action row component.
 * @param props - The component props.
 * @returns The rendered settings account action row component.
 */
function SettingsAccountActionRow(props: SettingsAccountActionRowProps) {
  const { action, description, title } = props;
  return (
    <div
      className="
        flex items-start justify-between gap-4
        max-sm:flex-col max-sm:items-stretch
      "
    >
      <div>
        <p className="text-sm font-medium">{title}</p>
        <p className="mt-1 text-xs text-muted-foreground">{description}</p>
      </div>
      {action}
    </div>
  );
}

/**
 * Render the account deletion row.
 * @param props - The delete action props.
 * @returns The rendered delete row.
 */
function SettingsAccountDeleteRow(props: SettingsAccountDeleteRowProps) {
  return (
    <SettingsAccountActionRow
      action={
        <Button
          className="h-8 shrink-0 gap-1.5"
          disabled={props.isDisabled}
          onClick={props.onDelete}
          size="sm"
          type="button"
          variant="destructive"
        >
          {props.isDeleting ? (
            <MotionSpinner iconClassName="size-3.5" />
          ) : (
            <Trash2 className="size-3.5" />
          )}
          {props.isDeleting ? "Deleting…" : "Delete Account"}
        </Button>
      }
      description="Permanently removes your user record and related saved data from this application."
      title={<span className="text-destructive">Delete account</span>}
    />
  );
}

/**
 * Render the account export row.
 * @param props - The export action props.
 * @returns The rendered export row.
 */
function SettingsAccountExportRow(props: SettingsAccountExportRowProps) {
  return (
    <SettingsAccountActionRow
      action={
        <Button
          className="h-8 shrink-0 gap-1.5"
          disabled={props.isDisabled}
          onClick={() => {
            void props.onExport();
          }}
          size="sm"
          type="button"
          variant="outline"
        >
          {props.isExporting ? (
            <MotionSpinner iconClassName="size-3.5" />
          ) : (
            <Download className="size-3.5" />
          )}
          {props.isExporting ? "Preparing…" : "Export Data"}
        </Button>
      }
      description="Download a JSON copy of your account profile, sessions, feeds, categories, and article status history."
      title="Data export"
    />
  );
}

/**
 * Render account settings heading and policy links.
 * @returns The rendered account header.
 */
function SettingsAccountHeader() {
  return (
    <>
      <div>
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <Shield className="size-3.5 text-muted-foreground" />
          Privacy and Account
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Review the service terms, export your data, or remove your account.
        </p>
      </div>
      <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
        <SettingsAccountPolicyLink href="/privacy" label="Privacy Policy" />
        <SettingsAccountPolicyLink href="/terms" label="Terms of Use" />
      </div>
    </>
  );
}
/**
 * Render the settings account policy link component.
 * @param props - The component props.
 * @returns The rendered settings account policy link component.
 */
function SettingsAccountPolicyLink(props: SettingsAccountPolicyLinkProps) {
  const { href, label } = props;
  return (
    <Link
      className="
        inline-flex items-center gap-1.5 transition-colors
        hover:text-foreground
      "
      href={href}
      target="_blank"
    >
      <FileText className="size-3.5" />
      {label}
    </Link>
  );
}

/**
 * Render the optional admin-only invitation section.
 * @param props - The visibility props.
 * @returns The rendered invitation section or null.
 */
function SettingsInvitationAdminSection(
  props: SettingsInvitationAdminSectionProps,
) {
  if (!props.isVisible) return null;
  return (
    <>
      <SettingsInvitationGenerator />
      <Separator />
    </>
  );
}

/**
 * Render the invitation generation button.
 * @param props - The generation action props.
 * @returns The rendered generation button.
 */
function SettingsInvitationGenerateButton(
  props: SettingsInvitationGenerateButtonProps,
) {
  return (
    <Button
      className="h-8 shrink-0 gap-1.5"
      disabled={props.isGenerating}
      onClick={() => {
        void props.onGenerate();
      }}
      size="sm"
      type="button"
      variant="outline"
    >
      {props.isGenerating ? (
        <MotionSpinner iconClassName="size-3.5" />
      ) : (
        <Link2 className="size-3.5" />
      )}
      {props.isGenerating ? "Generating..." : "Generate Link"}
    </Button>
  );
}

/**
 * Render the admin-only invitation generator.
 * @returns The rendered invitation generator.
 */
function SettingsInvitationGenerator() {
  const {
    email,
    emailInputRef,
    handleCopyInvitation,
    handleGenerateInvitation,
    invitationUrl,
    isGenerating,
    setEmail,
  } = useSettingsInvitationGenerator();

  return (
    <div className="space-y-3">
      <SettingsInvitationHeader />
      <div className="flex gap-2 max-sm:flex-col">
        <Input
          aria-label="Invitation email"
          className="h-8 min-w-0 flex-1"
          onChange={(event) => {
            setEmail(event.target.value);
          }}
          placeholder="Optional email"
          ref={emailInputRef}
          type="email"
          value={email}
        />
        <SettingsInvitationGenerateButton
          isGenerating={isGenerating}
          onGenerate={handleGenerateInvitation}
        />
      </div>
      <SettingsInvitationResult
        invitationUrl={invitationUrl}
        onCopy={handleCopyInvitation}
      />
    </div>
  );
}

/**
 * Render invitation section heading.
 * @returns The rendered invitation header.
 */
function SettingsInvitationHeader() {
  return (
    <div>
      <p className="flex items-center gap-1.5 text-sm font-medium">
        <Link2 className="size-3.5 text-muted-foreground" />
        Invitations
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        Generate single-use registration links for closed-signup deployments.
      </p>
    </div>
  );
}

/**
 * Render a generated invitation link with copy action.
 * @param props - The generated invitation props.
 * @returns The rendered invitation link result or null.
 */
function SettingsInvitationResult(props: SettingsInvitationResultProps) {
  if (!props.invitationUrl) return null;
  return (
    <div className="flex gap-2 max-sm:flex-col">
      <Input
        aria-label="Generated invitation link"
        className="h-8 min-w-0 flex-1 font-mono text-xs"
        readOnly
        value={props.invitationUrl}
      />
      <Button
        className="h-8 shrink-0 gap-1.5"
        onClick={() => {
          void props.onCopy();
        }}
        size="sm"
        type="button"
        variant="outline"
      >
        <Copy className="size-3.5" />
        Copy
      </Button>
    </div>
  );
}

/**
 * Manage the settings account actions.
 * @param onAccountDeleted - Callback invoked after the account is successfully deleted.
 * @returns The settings account actions state and callbacks.
 */
function useSettingsAccountActions(onAccountDeleted: () => void) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  /**
   * Process the handle export.
   */
  const handleExport = async () => {
    setIsExporting(true);
    try {
      const blob = await AccountService.exportAccountData();
      const downloadUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = downloadUrl;
      anchor.download = "librerss-account-export.json";
      anchor.click();
      URL.revokeObjectURL(downloadUrl);
      toast.success("Account export downloaded.");
    } catch {
      toast.error("Unable to export account data.");
    } finally {
      setIsExporting(false);
    }
  };

  /**
   * Process the handle delete.
   */
  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await AccountService.deleteAccount();
      await clearClientOriginState();
      toast.success("Account deleted.");
      onAccountDeleted();
    } catch {
      toast.error("Unable to delete the account.");
    } finally {
      setIsDeleting(false);
    }
  };

  return {
    /**
     * Confirms account deletion before running the destructive delete flow.
     */
    handleDeleteActionClick: () => {
      const shouldDelete = window.confirm(
        "Delete this account? This removes your saved feeds, categories, sessions, and reading state from the app.",
      );
      if (!shouldDelete) {
        return;
      }

      void handleDelete();
    },
    handleExport,
    isDeleting,
    isExporting,
  };
}

/**
 * Manage invitation generator state and actions.
 * @returns The invitation generator state and callbacks.
 */
function useSettingsInvitationGenerator() {
  const [email, setEmail] = useState("");
  const [invitationUrl, setInvitationUrl] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const emailInputRef = useRef<HTMLInputElement>(null);

  /**
   * Generate a new invitation link and keep it visible for immediate copying.
   */
  const handleGenerateInvitation = async () => {
    setIsGenerating(true);
    try {
      const invitation = await InvitationService.createInvitation(
        emailInputRef.current?.value ?? email,
      );
      setInvitationUrl(invitation.url);
      toast.success("Invitation link generated.");
    } catch {
      toast.error("Unable to generate invitation link.");
    } finally {
      setIsGenerating(false);
    }
  };

  /**
   * Copy the generated invitation link to the system clipboard.
   */
  const handleCopyInvitation = async () => {
    if (!invitationUrl) {
      return;
    }

    try {
      await navigator.clipboard.writeText(invitationUrl);
      toast.success("Invitation link copied.");
    } catch {
      toast.error("Unable to copy invitation link.");
    }
  };

  return {
    email,
    emailInputRef,
    handleCopyInvitation,
    handleGenerateInvitation,
    invitationUrl,
    isGenerating,
    setEmail,
  };
}
