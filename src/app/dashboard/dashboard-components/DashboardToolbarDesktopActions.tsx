"use client";

import {
  Check,
  CheckCheck,
  LogOut,
  Moon,
  RefreshCw,
  RotateCcw,
  Server,
  Settings2,
  Sun,
} from "lucide-react";

import { DashboardToolbarActionButton } from "@/app/dashboard/dashboard-components/DashboardToolbarActionButton";
import { DashboardToolbarIconButton } from "@/app/dashboard/dashboard-components/DashboardToolbarIconButton";
import { type useDashboardToolbarState } from "@/app/dashboard/toolbar";
import { Skeleton } from "@/components/ui/skeleton";

type DashboardToolbarDesktopActionsProps = Pick<
  ReturnType<typeof useDashboardToolbarState>,
  | "handleMarkAllRead"
  | "handleMarkViewportRead"
  | "handleOpenSettings"
  | "handleRefresh"
  | "handleRefreshFromUpstream"
  | "handleReset"
  | "handleSignOut"
  | "handleToggleTheme"
  | "isDark"
  | "isDevelopmentMode"
  | "isResetting"
  | "isSigningOut"
  | "mounted"
  | "themeToggleLabel"
> & { isToolbarActionPending: boolean };

export function DashboardToolbarDesktopActions({
  handleMarkAllRead,
  handleMarkViewportRead,
  handleOpenSettings,
  handleRefresh,
  handleRefreshFromUpstream,
  handleReset,
  handleSignOut,
  handleToggleTheme,
  isDark,
  isDevelopmentMode,
  isResetting,
  isSigningOut,
  isToolbarActionPending,
  mounted,
  themeToggleLabel,
}: DashboardToolbarDesktopActionsProps) {
  return (
    <div
      className="
        hidden items-center gap-4
        md:flex
      "
    >
      <DashboardToolbarActionButton
        ariaLabel="Refresh selected feed"
        icon={RefreshCw}
        isPending={isToolbarActionPending}
        onClick={handleRefresh}
      />
      <DashboardToolbarUpstreamRefreshButton
        handleRefreshFromUpstream={handleRefreshFromUpstream}
        isDevelopmentMode={isDevelopmentMode}
        isToolbarActionPending={isToolbarActionPending}
      />
      <DashboardToolbarActionButton
        ariaLabel="Mark fully visible articles as read"
        icon={Check}
        isPending={isToolbarActionPending}
        onClick={handleMarkViewportRead}
      />
      <DashboardToolbarActionButton
        ariaLabel="Mark all read"
        icon={CheckCheck}
        isPending={isToolbarActionPending}
        onClick={handleMarkAllRead}
      />
      <DashboardToolbarIconButton
        ariaLabel="Open dashboard settings"
        icon={Settings2}
        onClick={handleOpenSettings}
      />
      <DashboardToolbarIconButton
        ariaLabel="Sign out"
        disabled={isResetting || isSigningOut}
        icon={LogOut}
        onClick={() => void handleSignOut()}
      />
      <DashboardToolbarResetIconButton
        handleReset={handleReset}
        isDevelopmentMode={isDevelopmentMode}
        isResetting={isResetting}
      />
      <span className="h-3 w-px bg-border" />
      <DashboardToolbarThemeButton
        handleToggleTheme={handleToggleTheme}
        isDark={isDark}
        mounted={mounted}
        themeToggleLabel={themeToggleLabel}
      />
    </div>
  );
}

function DashboardToolbarResetIconButton({
  handleReset,
  isDevelopmentMode,
  isResetting,
}: {
  handleReset: () => Promise<void>;
  isDevelopmentMode: boolean;
  isResetting: boolean;
}) {
  return isDevelopmentMode ? (
    <DashboardToolbarIconButton
      ariaLabel="Reset app state"
      disabled={isResetting}
      icon={RotateCcw}
      onClick={() => void handleReset()}
    />
  ) : null;
}

function DashboardToolbarThemeButton({
  handleToggleTheme,
  isDark,
  mounted,
  themeToggleLabel,
}: {
  handleToggleTheme: () => void;
  isDark: boolean;
  mounted: boolean;
  themeToggleLabel: string;
}) {
  return mounted ? (
    <DashboardToolbarIconButton
      ariaLabel={themeToggleLabel}
      icon={isDark ? Sun : Moon}
      onClick={handleToggleTheme}
    />
  ) : (
    <Skeleton className="size-4 rounded-full" />
  );
}

function DashboardToolbarUpstreamRefreshButton({
  handleRefreshFromUpstream,
  isDevelopmentMode,
  isToolbarActionPending,
}: {
  handleRefreshFromUpstream: () => void;
  isDevelopmentMode: boolean;
  isToolbarActionPending: boolean;
}) {
  return isDevelopmentMode ? (
    <DashboardToolbarActionButton
      ariaLabel="Refresh selected feed from upstream"
      icon={Server}
      isPending={isToolbarActionPending}
      onClick={handleRefreshFromUpstream}
    />
  ) : null;
}
