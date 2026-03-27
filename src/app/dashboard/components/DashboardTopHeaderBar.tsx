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
  Search,
  Settings2,
  Sun,
} from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

import { useDashboardTopHeaderState } from "../hooks/useDashboardTopHeaderState";
import {
  DashboardTopHeaderActionButton,
  DashboardTopHeaderActionIcon,
} from "./DashboardTopHeaderActionButton";
import { MotionSpinner } from "./MotionSpinner";

const toolbarBtnClass =
  "cursor-pointer transition-colors duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring text-muted-foreground hover:text-foreground";

/**
 * Top dashboard toolbar for search, quick actions, theme controls, and logout.
 */
export function DashboardTopHeaderBar() {
  const {
    handleMarkAllRead,
    handleMarkViewportRead,
    handleOpenFeedsSidebar,
    handleOpenSettings,
    handleRefresh,
    handleReset,
    handleSearchChange,
    handleSignOut,
    handleToggleTheme,
    isDark,
    isDevelopmentMode,
    isMarkingAllRead,
    isMarkingViewportRead,
    isRefreshing,
    isResetting,
    isSearchPending,
    isSigningOut,
    mounted,
    search,
    themeToggleLabel,
    title,
  } = useDashboardTopHeaderState();
  const isToolbarActionPending =
    isRefreshing || isMarkingAllRead || isMarkingViewportRead;

  return (
    <div
      className="
        pointer-events-auto fixed inset-x-0 bottom-0 z-50 border-t
        border-border/50 bg-background/80 pb-[env(safe-area-inset-bottom)]
        backdrop-blur-md
        lg:top-0 lg:bottom-auto lg:border-t-0 lg:border-b lg:pb-0
      "
      suppressHydrationWarning
    >
      <div
        className="
          mx-auto flex h-14 max-w-6xl items-center gap-4 px-4
          pr-[max(1rem,env(safe-area-inset-right))]
          pl-[max(1rem,env(safe-area-inset-left))]
          md:px-6
        "
      >
        <button
          aria-label="Open feeds"
          className={`
            ${toolbarBtnClass}
            lg:hidden
          `}
          onClick={handleOpenFeedsSidebar}
          type="button"
        >
          <Menu className="size-4" />
        </button>

        <h1
          className="
            flex min-w-0 items-center gap-2 text-lg font-semibold tracking-tight
            select-none
          "
        >
          <img alt="LibreRSS logo" className="size-5" src="/favicon.svg" />
          <span className="truncate">{title}</span>
        </h1>

        <div className="relative min-w-0 flex-1">
          {isSearchPending ? (
            <MotionSpinner
              className="
                pointer-events-none absolute top-1/2 left-3 -translate-y-1/2
              "
              iconClassName="size-3.5 text-muted-foreground/60"
            />
          ) : (
            <Search
              className="
                pointer-events-none absolute top-1/2 left-3 size-3.5
                -translate-y-1/2 text-muted-foreground/40
              "
            />
          )}
          <Input
            className={`
              h-9 border-transparent pl-9 text-sm
              focus-visible:bg-background
              ${isSearchPending ? "bg-muted/45" : "bg-muted/30"}
            `}
            onChange={(e) => {
              handleSearchChange(e.target.value);
            }}
            placeholder="Search..."
            value={search}
          />
        </div>

        <DropdownMenu>
          <DashboardTopHeaderActionButton
            ariaLabel="Refresh selected feed"
            className={`
              shrink-0
              md:hidden
            `}
            icon={RefreshCw}
            isPending={isToolbarActionPending}
            onClick={handleRefresh}
          />

          <DashboardTopHeaderActionButton
            ariaLabel="Mark fully visible articles as read"
            className="
              shrink-0
              md:hidden
            "
            icon={Check}
            isPending={isToolbarActionPending}
            onClick={handleMarkViewportRead}
          />

          <DropdownMenuTrigger asChild>
            <button
              aria-label="Open actions menu"
              className={`
                ${toolbarBtnClass}
                shrink-0
                md:hidden
              `}
              type="button"
            >
              <EllipsisVertical className="size-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" sideOffset={8}>
            <DropdownMenuItem
              disabled={isMarkingAllRead}
              onSelect={handleMarkAllRead}
            >
              <DashboardTopHeaderActionIcon
                icon={CheckCheck}
                isPending={isMarkingAllRead}
              />
              Mark all read
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={handleOpenSettings}>
              <Settings2 className="size-4" />
              Settings
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={handleToggleTheme}
            >
              {mounted && isDark ? (
                <Sun className="size-4" />
              ) : (
                <Moon className="size-4" />
              )}
              {themeToggleLabel}
            </DropdownMenuItem>
            {isDevelopmentMode && (
              <DropdownMenuItem
                disabled={isResetting}
                onSelect={() => void handleReset()}
              >
                <RotateCcw className="size-4" />
                Reset
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              disabled={isResetting || isSigningOut}
              onSelect={() => void handleSignOut()}
            >
              <LogOut className="size-4" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <div
          className="
            hidden items-center gap-4
            md:flex
          "
        >
          <DashboardTopHeaderActionButton
            ariaLabel="Refresh selected feed"
            className=""
            icon={RefreshCw}
            isPending={isToolbarActionPending}
            onClick={handleRefresh}
          />

          <DashboardTopHeaderActionButton
            ariaLabel="Mark fully visible articles as read"
            icon={Check}
            isPending={isToolbarActionPending}
            onClick={handleMarkViewportRead}
          />

          <DashboardTopHeaderActionButton
            ariaLabel="Mark all read"
            icon={CheckCheck}
            isPending={isToolbarActionPending}
            onClick={handleMarkAllRead}
          />

          <button
            aria-label="Open dashboard settings"
            className={toolbarBtnClass}
            onClick={handleOpenSettings}
            type="button"
          >
            <Settings2 className="size-4" />
          </button>

          <button
            aria-label="Sign out"
            className={`
              ${toolbarBtnClass}
              disabled:cursor-not-allowed disabled:opacity-60
            `}
            disabled={isResetting || isSigningOut}
            onClick={() => void handleSignOut()}
            type="button"
          >
            <LogOut className="size-4" />
          </button>

          {isDevelopmentMode && (
            <button
              aria-label="Reset app state"
              className={`
                ${toolbarBtnClass}
                disabled:cursor-not-allowed disabled:opacity-60
              `}
              disabled={isResetting}
              onClick={() => void handleReset()}
              type="button"
            >
              <RotateCcw className="size-4" />
            </button>
          )}

          <span className="h-3 w-px bg-border" />

          {mounted ? (
            <button
              aria-label={themeToggleLabel}
              className={toolbarBtnClass}
              onClick={handleToggleTheme}
              type="button"
            >
              {isDark ? (
                <Sun className="size-4" />
              ) : (
                <Moon className="size-4" />
              )}
            </button>
          ) : (
            <Skeleton className="size-4 rounded-full" />
          )}
        </div>
      </div>
    </div>
  );
}
