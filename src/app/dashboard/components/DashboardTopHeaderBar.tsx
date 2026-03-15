"use client";

import {
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
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { DASHBOARD_EVENTS, DASHBOARD_PREVIEW_STORAGE_KEY } from "../constants";
import { setDashboardPreviewPersistence } from "../preview-mode";

import { MotionSpinner } from "./MotionSpinner";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { AuthService } from "@/lib/api/auth-service";
import { clearClientOriginState } from "@/lib/auth/clear-client-origin-state";
import { useLocalStorage } from "@/lib/hooks/useLocalStorage";

const toolbarBtnClass =
  "cursor-pointer transition-colors duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring text-muted-foreground hover:text-foreground";

/**
 * Top dashboard toolbar for search, quick actions, theme controls, and logout.
 */
export function DashboardTopHeaderBar() {
  const { resolvedTheme, setTheme } = useTheme();
  const isDevelopmentMode = process.env.NODE_ENV === "development";
  const [isSearchPending, setIsSearchPending] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [title, setTitle] = useState("LibreRSS");
  const [search, setSearch] = useState("");
  const [isResetting, setIsResetting] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [isPreviewMode, setIsPreviewMode] = useLocalStorage<boolean>(
    DASHBOARD_PREVIEW_STORAGE_KEY,
    false,
  );
  const [isMarkingAllRead, setIsMarkingAllRead] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const handleTitleChange = (event: Event) => {
      const detail = (event as CustomEvent<{ title?: string }>).detail;
      const title = typeof detail.title === "string" ? detail.title.trim() : "";
      setTitle(title === "" ? "LibreRSS" : title);
    };

    const handleSearchSync = (event: Event) => {
      const detail = (event as CustomEvent<{ term?: string }>).detail;
      setSearch(typeof detail.term === "string" ? detail.term : "");
    };

    const handleSearchPending = (event: Event) => {
      const detail = (event as CustomEvent<{ pending?: boolean }>).detail;
      setIsSearchPending(detail.pending === true);
    };

    const handleEnterPreview = () => {
      setIsPreviewMode(true);
    };
    const handleMarkAllReadStart = () => {
      setIsMarkingAllRead(true);
    };
    const handleMarkAllReadEnd = () => {
      setIsMarkingAllRead(false);
    };

    window.addEventListener(
      DASHBOARD_EVENTS.TITLE_CHANGE,
      handleTitleChange as EventListener,
    );
    window.addEventListener(
      DASHBOARD_EVENTS.SEARCH_SYNC,
      handleSearchSync as EventListener,
    );
    window.addEventListener(
      DASHBOARD_EVENTS.SEARCH_PENDING,
      handleSearchPending as EventListener,
    );
    window.addEventListener(DASHBOARD_EVENTS.ENTER_PREVIEW, handleEnterPreview);
    window.addEventListener(
      DASHBOARD_EVENTS.MARK_ALL_READ_START,
      handleMarkAllReadStart,
    );
    window.addEventListener(
      DASHBOARD_EVENTS.MARK_ALL_READ_END,
      handleMarkAllReadEnd,
    );
    return () => {
      window.removeEventListener(
        DASHBOARD_EVENTS.TITLE_CHANGE,
        handleTitleChange as EventListener,
      );
      window.removeEventListener(
        DASHBOARD_EVENTS.SEARCH_SYNC,
        handleSearchSync as EventListener,
      );
      window.removeEventListener(
        DASHBOARD_EVENTS.SEARCH_PENDING,
        handleSearchPending as EventListener,
      );
      window.removeEventListener(
        DASHBOARD_EVENTS.ENTER_PREVIEW,
        handleEnterPreview,
      );
      window.removeEventListener(
        DASHBOARD_EVENTS.MARK_ALL_READ_START,
        handleMarkAllReadStart,
      );
      window.removeEventListener(
        DASHBOARD_EVENTS.MARK_ALL_READ_END,
        handleMarkAllReadEnd,
      );
    };
  }, [setIsPreviewMode]);

  const isDark = mounted && (resolvedTheme ?? "dark") === "dark";
  const nextTheme = isDark ? "light" : "dark";
  const themeToggleLabel = mounted
    ? `Switch to ${nextTheme} mode`
    : "Toggle theme";

  const handleSearchChange = (term: string) => {
    setSearch(term);
    window.dispatchEvent(
      new CustomEvent(DASHBOARD_EVENTS.SEARCH_CHANGE, { detail: { term } }),
    );
  };

  const handleReset = async () => {
    if (isResetting) return;

    setIsResetting(true);
    try {
      await clearClientOriginState();
      window.location.reload();
    } catch {
      toast.error("Unable to reset app state.");
      setIsResetting(false);
    }
  };

  const handleSignOut = async () => {
    if (isSigningOut) return;

    if (isPreviewMode) {
      await clearClientOriginState();
      setIsPreviewMode(false);
      setDashboardPreviewPersistence(false);
      window.location.assign("/landing");
      return;
    }

    setIsSigningOut(true);
    try {
      await AuthService.logout();
      await clearClientOriginState();
      setIsPreviewMode(false);
      setDashboardPreviewPersistence(false);
      window.location.assign("/landing");
    } catch {
      toast.error("Unable to sign out.");
      setIsSigningOut(false);
    }
  };

  return (
    <div
      className="
        pointer-events-auto fixed inset-x-0 top-0 z-50 border-b border-border/50
        bg-background/80 backdrop-blur-md
      "
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
          onClick={() =>
            window.dispatchEvent(
              new CustomEvent(DASHBOARD_EVENTS.OPEN_FEEDS_SIDEBAR),
            )
          }
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
              onSelect={() =>
                window.dispatchEvent(new CustomEvent(DASHBOARD_EVENTS.REFRESH))
              }
            >
              <RefreshCw className="size-4" />
              Refresh selected feed
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={isMarkingAllRead}
              onSelect={() =>
                window.dispatchEvent(
                  new CustomEvent(DASHBOARD_EVENTS.MARK_ALL_READ),
                )
              }
            >
              <CheckCheck className="size-4" />
              Mark all read
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() =>
                window.dispatchEvent(
                  new CustomEvent(DASHBOARD_EVENTS.OPEN_SETTINGS),
                )
              }
            >
              <Settings2 className="size-4" />
              Settings
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={() => {
                setTheme(nextTheme);
              }}
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
          <button
            aria-label="Refresh selected feed"
            className={toolbarBtnClass}
            onClick={() =>
              window.dispatchEvent(new CustomEvent(DASHBOARD_EVENTS.REFRESH))
            }
            type="button"
          >
            <RefreshCw className="size-4" />
          </button>

          <button
            aria-label="Mark all read"
            className={`
              ${toolbarBtnClass}
              disabled:cursor-not-allowed disabled:opacity-70
            `}
            disabled={isMarkingAllRead}
            onClick={() =>
              window.dispatchEvent(
                new CustomEvent(DASHBOARD_EVENTS.MARK_ALL_READ),
              )
            }
            type="button"
          >
            {isMarkingAllRead ? (
              <MotionSpinner iconClassName="size-4" />
            ) : (
              <CheckCheck className="size-4" />
            )}
          </button>

          <button
            aria-label="Open dashboard settings"
            className={toolbarBtnClass}
            onClick={() =>
              window.dispatchEvent(
                new CustomEvent(DASHBOARD_EVENTS.OPEN_SETTINGS),
              )
            }
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

          <button
            aria-label={themeToggleLabel}
            className={toolbarBtnClass}
            onClick={() => {
              setTheme(nextTheme);
            }}
            type="button"
          >
            {mounted && isDark ? (
              <Sun className="size-4" />
            ) : (
              <Moon className="size-4" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
