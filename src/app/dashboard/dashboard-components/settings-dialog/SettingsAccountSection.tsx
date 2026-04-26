"use client";

import { Download, FileText, Shield, Trash2 } from "lucide-react";
import Link from "next/link";
import { type ReactNode, useState } from "react";
import { toast } from "sonner";

import { MotionSpinner } from "@/app/dashboard/dashboard-components/status";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { AccountService } from "@/lib/api";
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
  onAccountDeleted: () => void;
}

/**
 * Render the settings account section component.
 * @param props - The component props.
 * @returns The rendered settings account section component.
 */
export function SettingsAccountSection(props: SettingsAccountSectionProps) {
  const { onAccountDeleted } = props;
  const { handleDeleteActionClick, handleExport, isDeleting, isExporting } =
    useSettingsAccountActions(onAccountDeleted);

  return (
    <>
      <section className="settings-card">
        <div>
          <h3 className="section-heading">
            <Shield className="icon-muted" />
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

        <Separator />

        <SettingsAccountActionRow
          action={
            <Button
              className="h-8 shrink-0 gap-1.5"
              disabled={isExporting || isDeleting}
              onClick={() => {
                void handleExport();
              }}
              size="sm"
              type="button"
              variant="outline"
            >
              {isExporting ? (
                <MotionSpinner iconClassName="size-3.5" />
              ) : (
                <Download className="size-3.5" />
              )}
              {isExporting ? "Preparing…" : "Export Data"}
            </Button>
          }
          description="Download a JSON copy of your account profile, sessions, feeds, categories, and article status history."
          title="Data export"
        />

        <Separator />

        <SettingsAccountActionRow
          action={
            <Button
              className="h-8 shrink-0 gap-1.5"
              disabled={isDeleting || isExporting}
              onClick={handleDeleteActionClick}
              size="sm"
              type="button"
              variant="destructive"
            >
              {isDeleting ? (
                <MotionSpinner iconClassName="size-3.5" />
              ) : (
                <Trash2 className="size-3.5" />
              )}
              {isDeleting ? "Deleting…" : "Delete Account"}
            </Button>
          }
          description="Permanently removes your user record and related saved data from this application."
          title={<span className="text-destructive">Delete account</span>}
        />
      </section>
    </>
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
        row-between items-start gap-4
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
 * Manage the settings account actions.
 * @param onAccountDeleted - The callback that on account deleted.
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
