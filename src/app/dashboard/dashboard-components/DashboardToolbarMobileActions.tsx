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

/** Renders the mobile toolbar actions using the desktop uncondensed icon treatment. */
export function DashboardToolbarMobileActions({
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
}: DashboardToolbarMobileActionsProps) {
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

export function DashboardToolbarMobileMenuButton({
  handleOpenFeedsSidebar,
}: Pick<
  ReturnType<typeof useDashboardToolbarState>,
  "handleOpenFeedsSidebar"
>) {
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
>(function DashboardToolbarMobileActionsTrigger(
  { className, type = "button", ...props },
  ref,
) {
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
      {...props}
    >
      <EllipsisVertical className="size-4" />
    </button>
  );
});

function DashboardToolbarMobileMenuContent({
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
}: DashboardToolbarMobileMenuContentProps) {
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

/** Uses the shared desktop-sized quick-action footprint on mobile. */
function DashboardToolbarMobileQuickAction({
  ariaLabel,
  icon,
  isPending,
  onClick,
}: {
  ariaLabel: string;
  icon: typeof RefreshCw;
  isPending: boolean;
  onClick: () => void;
}) {
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

function DashboardToolbarResetMenuItem({
  handleReset,
  isDevelopmentMode,
  isResetting,
}: {
  handleReset: () => Promise<void>;
  isDevelopmentMode: boolean;
  isResetting: boolean;
}) {
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

function DashboardToolbarUpstreamRefreshMenuItem({
  handleRefreshFromUpstream,
  isDevelopmentMode,
  isRefreshing,
}: {
  handleRefreshFromUpstream: () => void;
  isDevelopmentMode: boolean;
  isRefreshing: boolean;
}) {
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
