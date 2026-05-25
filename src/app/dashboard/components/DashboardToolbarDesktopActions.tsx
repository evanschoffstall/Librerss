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

import { DashboardToolbarActionButton } from "@/app/dashboard/components/DashboardToolbarActionButton";
import { DashboardToolbarIconButton } from "@/app/dashboard/components/DashboardToolbarIconButton";
import { type useDashboardToolbarState } from "@/app/dashboard/toolbar";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Describes the props for the dashboard toolbar desktop actions component.
 */
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

/**
 * Describes the props for the dashboard toolbar reset icon button component.
 */
interface DashboardToolbarResetIconButtonProps {
  handleReset: () => Promise<void>;
  isDevelopmentMode: boolean;
  isResetting: boolean;
}
/**
 * Describes the props for the dashboard toolbar theme button component.
 */
interface DashboardToolbarThemeButtonProps {
  handleToggleTheme: () => void;
  isDark: boolean;
  mounted: boolean;
  themeToggleLabel: string;
}

/**
 * Describes the props for the dashboard toolbar upstream refresh button component.
 */
interface DashboardToolbarUpstreamRefreshButtonProps {
  handleRefreshFromUpstream: () => void;
  isDevelopmentMode: boolean;
  isToolbarActionPending: boolean;
} /**
 * Render the dashboard toolbar desktop actions component.
 * @param props - The component props.
 * @returns The rendered dashboard toolbar desktop actions component.
 */
export function DashboardToolbarDesktopActions(
  props: DashboardToolbarDesktopActionsProps,
) {
  const {
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
  } = props;
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

/**
 * Render the dashboard toolbar reset icon button component.
 * @param props - The component props.
 * @returns The rendered dashboard toolbar reset icon button component.
 */
function DashboardToolbarResetIconButton(
  props: DashboardToolbarResetIconButtonProps,
) {
  const { handleReset, isDevelopmentMode, isResetting } = props;
  return isDevelopmentMode ? (
    <DashboardToolbarIconButton
      ariaLabel="Reset app state"
      disabled={isResetting}
      icon={RotateCcw}
      onClick={() => void handleReset()}
    />
  ) : null;
} /**
 * Render the dashboard toolbar theme button component.
 * @param props - The component props.
 * @returns The rendered dashboard toolbar theme button component.
 */
function DashboardToolbarThemeButton(props: DashboardToolbarThemeButtonProps) {
  const { handleToggleTheme, isDark, mounted, themeToggleLabel } = props;
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

/**
 * Render the dashboard toolbar upstream refresh button component.
 * @param props - The component props.
 * @returns The rendered dashboard toolbar upstream refresh button component.
 */
function DashboardToolbarUpstreamRefreshButton(
  props: DashboardToolbarUpstreamRefreshButtonProps,
) {
  const {
    handleRefreshFromUpstream,
    isDevelopmentMode,
    isToolbarActionPending,
  } = props;
  return isDevelopmentMode ? (
    <DashboardToolbarActionButton
      ariaLabel="Refresh selected feed from upstream"
      icon={Server}
      isPending={isToolbarActionPending}
      onClick={handleRefreshFromUpstream}
    />
  ) : null;
}
