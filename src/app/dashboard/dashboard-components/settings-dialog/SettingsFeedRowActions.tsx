import type React from "react";

import {
  Eye,
  EyeOff,
  FileSearch,
  FileX,
  Pencil,
  Shield,
  ShieldOff,
  Trash2,
} from "lucide-react";

import type { SettingsFeedRowProps } from "@/app/dashboard/dashboard-components/settings-dialog/SettingsFeedRow";

import { SettingsIconButton } from "@/app/dashboard/dashboard-components/settings-dialog/SettingsIconButton";
import { MotionSpinner } from "@/app/dashboard/dashboard-components/status";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export interface SettingsFeedRowDerivedState {
  isDeleting: boolean;
  isDragging: boolean;
  isDropAfter: boolean;
  isDropBefore: boolean;
  isEditing: boolean;
  isEnabled: boolean;
  isExtractionDisabled: boolean;
  isProxyEnabled: boolean;
  isTogglingEnabled: boolean;
  isUpdatingSettings: boolean;
  pendingSetting: "extraction" | "proxy" | null;
  setPendingSetting: React.Dispatch<
    React.SetStateAction<"extraction" | "proxy" | null>
  >;
  settingsBusy: boolean;
  startEditingFeed: () => void;
}

interface FeedRowActionsProps {
  isMobile: boolean;
  rowProps: SettingsFeedRowProps;
  rowState: SettingsFeedRowDerivedState;
}

/**
 * @param root0
 * @param root0.isMobile
 * @param root0.rowProps
 * @param root0.rowState
 */
export function FeedRowActions({
  isMobile,
  rowProps,
  rowState,
}: FeedRowActionsProps) {
  return isMobile ? (
    <MobileFeedActions rowProps={rowProps} rowState={rowState} />
  ) : (
    <DesktopFeedActions rowProps={rowProps} rowState={rowState} />
  );
}

/**
 * @param root0
 * @param root0.rowProps
 * @param root0.rowState
 */
function DesktopFeedActions({
  rowProps,
  rowState,
}: Omit<FeedRowActionsProps, "isMobile">) {
  return (
    <div className="flex shrink-0 items-center gap-1">
      <FeedEditButton rowProps={rowProps} rowState={rowState} />
      <FeedExtractionButton rowProps={rowProps} rowState={rowState} />
      <FeedProxyButton rowProps={rowProps} rowState={rowState} />
      <FeedEnabledButton rowProps={rowProps} rowState={rowState} />
      <div className="mx-0.5 h-4 w-px bg-border/40" />
      <FeedRemoveButton rowProps={rowProps} rowState={rowState} />
    </div>
  );
}

/**
 * @param root0
 * @param root0.rowProps
 * @param root0.rowState
 */
function FeedEditButton({
  rowProps,
  rowState,
}: Omit<FeedRowActionsProps, "isMobile">) {
  return (
    <SettingsIconButton
      ariaLabel={`Edit ${rowProps.feedNode.label}`}
      className="
        opacity-0 transition-opacity duration-150
        group-focus-within:opacity-100
        group-hover:opacity-100
      "
      disabled={rowState.settingsBusy || rowState.isDragging}
      onClick={rowState.startEditingFeed}
      tip="Edit feed"
    >
      <Pencil className="size-3.5" />
    </SettingsIconButton>
  );
}

/**
 * @param root0
 * @param root0.rowProps
 * @param root0.rowState
 */
function FeedEnabledButton({
  rowProps,
  rowState,
}: Omit<FeedRowActionsProps, "isMobile">) {
  return (
    <SettingsIconButton
      disabled={
        rowState.isTogglingEnabled || rowState.isDeleting || rowState.isDragging
      }
      onClick={() => {
        rowProps.onToggleEnabled(rowProps.feedNode.key, !rowState.isEnabled);
      }}
      tip={rowState.isEnabled ? "Disable feed" : "Enable feed"}
    >
      {rowState.isTogglingEnabled ? (
        <MotionSpinner iconClassName="size-3.5" />
      ) : rowState.isEnabled ? (
        <Eye className="size-3.5" />
      ) : (
        <EyeOff className="size-3.5" />
      )}
    </SettingsIconButton>
  );
}

/**
 * @param root0
 * @param root0.rowProps
 * @param root0.rowState
 */
function FeedEnabledMenuItem({
  rowProps,
  rowState,
}: Omit<FeedRowActionsProps, "isMobile">) {
  return (
    <DropdownMenuItem
      disabled={rowState.isTogglingEnabled || rowState.isDeleting}
      onSelect={() => {
        rowProps.onToggleEnabled(rowProps.feedNode.key, !rowState.isEnabled);
      }}
    >
      {rowState.isTogglingEnabled ? (
        <MotionSpinner iconClassName="size-3.5" />
      ) : rowState.isEnabled ? (
        <EyeOff className="size-4" />
      ) : (
        <Eye className="size-4" />
      )}
      {rowState.isEnabled ? "Disable feed" : "Enable feed"}
    </DropdownMenuItem>
  );
}

/**
 * @param root0
 * @param root0.rowProps
 * @param root0.rowState
 */
function FeedExtractionButton({
  rowProps,
  rowState,
}: Omit<FeedRowActionsProps, "isMobile">) {
  return (
    <SettingsIconButton
      className={
        rowState.isExtractionDisabled ? "text-muted-foreground/50" : ""
      }
      disabled={rowState.settingsBusy}
      onClick={() => {
        rowState.setPendingSetting("extraction");
        rowProps.onToggleExtractionDisabled(
          rowProps.feedNode.key,
          !rowState.isExtractionDisabled,
        );
      }}
      tip={
        rowState.isExtractionDisabled
          ? "Enable extraction"
          : "Disable extraction"
      }
    >
      {renderSettingsProgressIcon(
        rowState.isUpdatingSettings,
        rowState.pendingSetting,
        "extraction",
        rowState.isExtractionDisabled ? (
          <FileX className="size-3.5" />
        ) : (
          <FileSearch className="size-3.5" />
        ),
      )}
    </SettingsIconButton>
  );
}

/**
 * @param root0
 * @param root0.rowProps
 * @param root0.rowState
 */
function FeedExtractionMenuItem({
  rowProps,
  rowState,
}: Omit<FeedRowActionsProps, "isMobile">) {
  return (
    <DropdownMenuItem
      disabled={rowState.settingsBusy}
      onSelect={() => {
        rowState.setPendingSetting("extraction");
        rowProps.onToggleExtractionDisabled(
          rowProps.feedNode.key,
          !rowState.isExtractionDisabled,
        );
      }}
    >
      {renderSettingsProgressIcon(
        rowState.isUpdatingSettings,
        rowState.pendingSetting,
        "extraction",
        rowState.isExtractionDisabled ? (
          <FileSearch className="size-4" />
        ) : (
          <FileX className="size-4" />
        ),
      )}
      {rowState.isExtractionDisabled
        ? "Enable extraction"
        : "Disable extraction"}
    </DropdownMenuItem>
  );
}

/**
 * @param root0
 * @param root0.rowProps
 * @param root0.rowState
 */
function FeedProxyButton({
  rowProps,
  rowState,
}: Omit<FeedRowActionsProps, "isMobile">) {
  return (
    <SettingsIconButton
      className={
        rowState.isProxyEnabled ? "text-primary/80" : `text-muted-foreground/50`
      }
      disabled={rowState.settingsBusy}
      onClick={() => {
        rowState.setPendingSetting("proxy");
        rowProps.onToggleProxyEnabled(
          rowProps.feedNode.key,
          !rowState.isProxyEnabled,
        );
      }}
      tip={rowState.isProxyEnabled ? "Disable proxy" : "Enable proxy"}
    >
      {renderSettingsProgressIcon(
        rowState.isUpdatingSettings,
        rowState.pendingSetting,
        "proxy",
        rowState.isProxyEnabled ? (
          <Shield className="size-3.5" />
        ) : (
          <ShieldOff className="size-3.5" />
        ),
      )}
    </SettingsIconButton>
  );
}

/**
 * @param root0
 * @param root0.rowProps
 * @param root0.rowState
 */
function FeedProxyMenuItem({
  rowProps,
  rowState,
}: Omit<FeedRowActionsProps, "isMobile">) {
  return (
    <DropdownMenuItem
      disabled={rowState.settingsBusy}
      onSelect={() => {
        rowState.setPendingSetting("proxy");
        rowProps.onToggleProxyEnabled(
          rowProps.feedNode.key,
          !rowState.isProxyEnabled,
        );
      }}
    >
      {renderSettingsProgressIcon(
        rowState.isUpdatingSettings,
        rowState.pendingSetting,
        "proxy",
        rowState.isProxyEnabled ? (
          <ShieldOff className="size-4" />
        ) : (
          <Shield className="size-4" />
        ),
      )}
      {rowState.isProxyEnabled ? "Disable proxy" : "Enable proxy"}
    </DropdownMenuItem>
  );
}

/**
 * @param root0
 * @param root0.rowProps
 * @param root0.rowState
 */
function FeedRemoveButton({
  rowProps,
  rowState,
}: Omit<FeedRowActionsProps, "isMobile">) {
  return (
    <SettingsIconButton
      className="
        text-muted-foreground
        hover:text-destructive
      "
      disabled={
        rowState.isDeleting || rowState.isDragging || rowState.isTogglingEnabled
      }
      onClick={() => {
        rowProps.onRemove(rowProps.feedNode.key);
      }}
      tip="Remove feed"
    >
      {rowState.isDeleting ? (
        <MotionSpinner iconClassName="size-3.5" />
      ) : (
        <Trash2 className="size-3.5" />
      )}
    </SettingsIconButton>
  );
}

/**
 * @param root0
 * @param root0.rowProps
 * @param root0.rowState
 */
function FeedRemoveMenuItem({
  rowProps,
  rowState,
}: Omit<FeedRowActionsProps, "isMobile">) {
  return (
    <DropdownMenuItem
      className="
        text-destructive
        focus:text-destructive
      "
      disabled={rowState.isDeleting || rowState.isTogglingEnabled}
      onSelect={() => {
        rowProps.onRemove(rowProps.feedNode.key);
      }}
    >
      {rowState.isDeleting ? (
        <MotionSpinner iconClassName="size-3.5" />
      ) : (
        <Trash2 className="size-4" />
      )}
      Remove feed
    </DropdownMenuItem>
  );
}

/**
 * @param root0
 * @param root0.rowProps
 * @param root0.rowState
 */
function MobileFeedActions({
  rowProps,
  rowState,
}: Omit<FeedRowActionsProps, "isMobile">) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          aria-label={`Open actions for ${rowProps.feedNode.label}`}
          className="size-7 shrink-0"
          disabled={rowState.isDragging}
          size="icon"
          type="button"
          variant="ghost"
        >
          <Pencil className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={8}>
        <DropdownMenuItem
          disabled={rowState.settingsBusy}
          onSelect={rowState.startEditingFeed}
        >
          <Pencil className="size-4" />
          Edit feed
        </DropdownMenuItem>
        <FeedEnabledMenuItem rowProps={rowProps} rowState={rowState} />
        <FeedExtractionMenuItem rowProps={rowProps} rowState={rowState} />
        <FeedProxyMenuItem rowProps={rowProps} rowState={rowState} />
        <DropdownMenuSeparator />
        <FeedRemoveMenuItem rowProps={rowProps} rowState={rowState} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * @param isUpdatingSettings
 * @param pendingSetting
 * @param setting
 * @param icon
 */
function renderSettingsProgressIcon(
  isUpdatingSettings: boolean,
  pendingSetting: SettingsFeedRowDerivedState["pendingSetting"],
  setting: Exclude<SettingsFeedRowDerivedState["pendingSetting"], null>,
  icon: React.ReactNode,
) {
  if (isUpdatingSettings && pendingSetting === setting) {
    return <MotionSpinner iconClassName="size-3.5" />;
  }

  return icon;
}
