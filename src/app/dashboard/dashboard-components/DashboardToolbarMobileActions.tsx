"use client";

import {
  Check,
  CheckCheck,
  EllipsisVertical,
  LogOut,
  Menu,
  Moon,
  RefreshCw,
  RotateCcw,
  Server,
  Settings2,
  Sun,
} from "lucide-react";
import * as React from "react";

import {
  DashboardToolbarActionButton,
  DashboardToolbarActionIcon,
} from "@/app/dashboard/dashboard-components/DashboardToolbarActionButton";
import {
  toolbarButtonClassName,
  toolbarIconButtonLayoutClassName,
} from "@/app/dashboard/dashboard-components/DashboardToolbarIconButton";
import { type useDashboardToolbarState } from "@/app/dashboard/toolbar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * Describes the props for the dashboard toolbar mobile actions component.
 */
type DashboardToolbarMobileActionsProps = Pick<
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
  | "isMarkingAllRead"
  | "isRefreshing"
  | "isResetting"
  | "isSigningOut"
  | "mounted"
  | "themeToggleLabel"
> & {
  isToolbarActionPending: boolean;
  mobileToolbarMirror: boolean;
};

/**
 * Describes the props for the dashboard toolbar mobile menu content component.
 */
type DashboardToolbarMobileMenuContentProps = Pick<
  ReturnType<typeof useDashboardToolbarState>,
  | "handleMarkAllRead"
  | "handleOpenSettings"
  | "handleRefreshFromUpstream"
  | "handleReset"
  | "handleSignOut"
  | "handleToggleTheme"
  | "isDark"
  | "isDevelopmentMode"
  | "isMarkingAllRead"
  | "isRefreshing"
  | "isResetting"
  | "isSigningOut"
  | "mounted"
  | "themeToggleLabel"
> & {
  mobileToolbarMirror: boolean;
};

/**
 * Render the dashboard toolbar mobile actions component.
 * @param props - The component props.
 * @returns The rendered dashboard toolbar mobile actions component.
 */
export function DashboardToolbarMobileActions(
  props: DashboardToolbarMobileActionsProps,
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
    isMarkingAllRead,
    isRefreshing,
    isResetting,
    isSigningOut,
    isToolbarActionPending,
    mobileToolbarMirror,
    mounted,
    themeToggleLabel,
  } = props;
  return (
    <DropdownMenu>
      <div
        className="
          flex items-center gap-4
          md:hidden
        "
      >
        <DashboardToolbarMobileQuickAction
          ariaLabel="Refresh selected feed"
          icon={RefreshCw}
          isPending={isToolbarActionPending}
          onClick={handleRefresh}
        />
        <DashboardToolbarMobileQuickAction
          ariaLabel="Mark fully visible articles as read"
          icon={Check}
          isPending={isToolbarActionPending}
          onClick={handleMarkViewportRead}
        />
        <DropdownMenuTrigger asChild>
          <DashboardToolbarMobileActionsTrigger />
        </DropdownMenuTrigger>
      </div>
      <DashboardToolbarMobileMenuContent
        handleMarkAllRead={handleMarkAllRead}
        handleOpenSettings={handleOpenSettings}
        handleRefreshFromUpstream={handleRefreshFromUpstream}
        handleReset={handleReset}
        handleSignOut={handleSignOut}
        handleToggleTheme={handleToggleTheme}
        isDark={isDark}
        isDevelopmentMode={isDevelopmentMode}
        isMarkingAllRead={isMarkingAllRead}
        isRefreshing={isRefreshing}
        isResetting={isResetting}
        isSigningOut={isSigningOut}
        mobileToolbarMirror={mobileToolbarMirror}
        mounted={mounted}
        themeToggleLabel={themeToggleLabel}
      />
    </DropdownMenu>
  );
}

/**
 * Render the dashboard toolbar mobile menu button component.
 * @param props - The component props.
 * @returns The rendered dashboard toolbar mobile menu button component.
 */
export function DashboardToolbarMobileMenuButton(
  props: Pick<
    ReturnType<typeof useDashboardToolbarState>,
    "handleOpenFeedsSidebar"
  >,
) {
  const { handleOpenFeedsSidebar } = props;
  return (
    <button
      aria-label="Open feeds"
      className={`
        ${toolbarButtonClassName}
        ${toolbarIconButtonLayoutClassName}
        lg:hidden
      `}
      onClick={handleOpenFeedsSidebar}
      type="button"
    >
      <Menu className="size-4" />
    </button>
  );
}

const DashboardToolbarMobileActionsTrigger = React.forwardRef<
  HTMLButtonElement,
  React.ComponentPropsWithoutRef<"button">
>(
  /**
   * Render the dashboard toolbar mobile actions trigger component.
   * @param props - The component props.
   * @param ref - The ref.
   * @returns The rendered dashboard toolbar mobile actions trigger component.
   */
  function DashboardToolbarMobileActionsTrigger(
    props: React.ComponentPropsWithoutRef<"button">,
    ref,
  ) {
    const { className, type = "button", ...buttonProps } = props;

    return (
      <button
        aria-label="Open actions menu"
        className={`
        ${toolbarButtonClassName}
        ${toolbarIconButtonLayoutClassName}
        ${className ?? ""}
      `}
        ref={ref}
        type={type}
        {...buttonProps}
      >
        <EllipsisVertical className="size-4" />
      </button>
    );
  },
);

/**
 * Describes the props for the dashboard toolbar mobile quick action component.
 */
interface DashboardToolbarMobileQuickActionProps {
  ariaLabel: string;
  icon: typeof RefreshCw;
  isPending: boolean;
  onClick: () => void;
}
/**
 * Describes the props for the dashboard toolbar reset menu item component.
 */
interface DashboardToolbarResetMenuItemProps {
  handleReset: () => Promise<void>;
  isDevelopmentMode: boolean;
  isResetting: boolean;
}

/**
 * Describes the props for the dashboard toolbar upstream refresh menu item component.
 */
interface DashboardToolbarUpstreamRefreshMenuItemProps {
  handleRefreshFromUpstream: () => void;
  isDevelopmentMode: boolean;
  isRefreshing: boolean;
}
/**
 * Render the dashboard toolbar mobile menu content component.
 * @param props - The component props.
 * @returns The rendered dashboard toolbar mobile menu content component.
 */
function DashboardToolbarMobileMenuContent(
  props: DashboardToolbarMobileMenuContentProps,
) {
  const {
    handleMarkAllRead,
    handleOpenSettings,
    handleRefreshFromUpstream,
    handleReset,
    handleSignOut,
    handleToggleTheme,
    isDark,
    isDevelopmentMode,
    isMarkingAllRead,
    isRefreshing,
    isResetting,
    isSigningOut,
    mobileToolbarMirror,
    mounted,
    themeToggleLabel,
  } = props;
  return (
    <DropdownMenuContent
      align={mobileToolbarMirror ? "start" : "end"}
      sideOffset={8}
      suppressHydrationWarning
    >
      <DropdownMenuItem
        disabled={isMarkingAllRead}
        onSelect={handleMarkAllRead}
      >
        <DashboardToolbarActionIcon
          icon={CheckCheck}
          isPending={isMarkingAllRead}
        />
        Mark all read
      </DropdownMenuItem>
      <DropdownMenuItem onSelect={handleOpenSettings}>
        <Settings2 className="size-4" />
        Settings
      </DropdownMenuItem>
      <DashboardToolbarUpstreamRefreshMenuItem
        handleRefreshFromUpstream={handleRefreshFromUpstream}
        isDevelopmentMode={isDevelopmentMode}
        isRefreshing={isRefreshing}
      />
      <DropdownMenuSeparator />
      <DropdownMenuItem onSelect={handleToggleTheme}>
        {mounted && isDark ? (
          <Sun className="size-4" />
        ) : (
          <Moon className="size-4" />
        )}
        {themeToggleLabel}
      </DropdownMenuItem>
      <DashboardToolbarResetMenuItem
        handleReset={handleReset}
        isDevelopmentMode={isDevelopmentMode}
        isResetting={isResetting}
      />
      <DropdownMenuItem
        disabled={isResetting || isSigningOut}
        onSelect={() => void handleSignOut()}
      >
        <LogOut className="size-4" />
        Sign out
      </DropdownMenuItem>
    </DropdownMenuContent>
  );
}

/**
 * Render the dashboard toolbar mobile quick action component.
 * @param props - The component props.
 * @returns The rendered dashboard toolbar mobile quick action component.
 */
function DashboardToolbarMobileQuickAction(
  props: DashboardToolbarMobileQuickActionProps,
) {
  const { ariaLabel, icon, isPending, onClick } = props;
  return (
    <DashboardToolbarActionButton
      ariaLabel={ariaLabel}
      className="md:hidden"
      icon={icon}
      isPending={isPending}
      onClick={onClick}
    />
  );
}
/**
 * Render the dashboard toolbar reset menu item component.
 * @param props - The component props.
 * @returns The rendered dashboard toolbar reset menu item component.
 */
function DashboardToolbarResetMenuItem(
  props: DashboardToolbarResetMenuItemProps,
) {
  const { handleReset, isDevelopmentMode, isResetting } = props;
  return isDevelopmentMode ? (
    <DropdownMenuItem
      disabled={isResetting}
      onSelect={() => void handleReset()}
    >
      <RotateCcw className="size-4" />
      Reset
    </DropdownMenuItem>
  ) : null;
}

/**
 * Render the dashboard toolbar upstream refresh menu item component.
 * @param props - The component props.
 * @returns The rendered dashboard toolbar upstream refresh menu item component.
 */
function DashboardToolbarUpstreamRefreshMenuItem(
  props: DashboardToolbarUpstreamRefreshMenuItemProps,
) {
  const { handleRefreshFromUpstream, isDevelopmentMode, isRefreshing } = props;
  return isDevelopmentMode ? (
    <DropdownMenuItem
      disabled={isRefreshing}
      onSelect={handleRefreshFromUpstream}
    >
      <Server className="size-4" />
      Upstream refresh
    </DropdownMenuItem>
  ) : null;
}
