"use client";

import {
  CheckCheck,
  EllipsisVertical,
  Loader2,
  LogOut,
  Menu,
  Moon,
  RefreshCw,
  Search,
  Settings2,
  Sun,
} from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { DASHBOARD_EVENTS, DASHBOARD_PREVIEW_STORAGE_KEY } from "../constants";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { AuthService, useLocalStorage } from "@/lib";

const toolbarBtnClass =
  "cursor-pointer transition-colors anim-duration-ui anim-ease-ui focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring text-muted-foreground hover:text-foreground";

export function DashboardTopHeaderBar() {
  const { resolvedTheme, setTheme } = useTheme();
  const [isSearchPending, setIsSearchPending] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [title, setTitle] = useState("LibreRSS");
  const [search, setSearch] = useState("");
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

  const handleSignOut = async () => {
    if (isSigningOut) return;

    if (isPreviewMode) {
      setIsPreviewMode(false);
      window.location.assign("/landing");
      return;
    }

    setIsSigningOut(true);
    try {
      await AuthService.logout();
      setIsPreviewMode(false);
      window.location.assign("/landing");
    } catch {
      toast.error("Unable to sign out.");
      setIsSigningOut(false);
    }
  };

  return (
    <div className="fixed inset-x-0 top-0 z-50 pointer-events-auto border-b border-border/50 bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4 [padding-left:max(1rem,env(safe-area-inset-left))] [padding-right:max(1rem,env(safe-area-inset-right))] md:px-6">
        <button
          aria-label="Open feeds"
          className={`${toolbarBtnClass} lg:hidden`}
          onClick={() =>
            window.dispatchEvent(
              new CustomEvent(DASHBOARD_EVENTS.OPEN_FEEDS_SIDEBAR),
            )
          }
          type="button"
        >
          <Menu className="h-4 w-4" />
        </button>

        <h1 className="flex min-w-0 select-none items-center gap-2 text-lg font-semibold tracking-tight">
          <img alt="LibreRSS logo" className="h-5 w-5" src="/favicon.svg" />
          <span className="truncate">{title}</span>
        </h1>

        <div className="relative min-w-0 flex-1">
          {isSearchPending ? (
            <Loader2 className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 animate-spin text-muted-foreground/60" />
          ) : (
            <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground/40" />
          )}
          <Input
            className={`h-9 border-transparent pl-9 text-sm focus-visible:bg-background ${
              isSearchPending ? "bg-muted/45" : "bg-muted/30"
            }`}
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
              className={`${toolbarBtnClass} shrink-0 md:hidden`}
              type="button"
            >
              <EllipsisVertical className="h-4 w-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" sideOffset={8}>
            <DropdownMenuItem
              onSelect={() =>
                window.dispatchEvent(new CustomEvent(DASHBOARD_EVENTS.REFRESH))
              }
            >
              <RefreshCw className="h-4 w-4" />
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
              <CheckCheck className="h-4 w-4" />
              Mark all read
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() =>
                window.dispatchEvent(
                  new CustomEvent(DASHBOARD_EVENTS.OPEN_SETTINGS),
                )
              }
            >
              <Settings2 className="h-4 w-4" />
              Settings
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={() => {
                setTheme(nextTheme);
              }}
            >
              {mounted && isDark ? (
                <Sun className="h-4 w-4" />
              ) : (
                <Moon className="h-4 w-4" />
              )}
              {themeToggleLabel}
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={isSigningOut}
              onSelect={() => void handleSignOut()}
            >
              <LogOut className="h-4 w-4" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="hidden items-center gap-4 md:flex">
          <button
            aria-label="Refresh selected feed"
            className={toolbarBtnClass}
            onClick={() =>
              window.dispatchEvent(new CustomEvent(DASHBOARD_EVENTS.REFRESH))
            }
            type="button"
          >
            <RefreshCw className="h-4 w-4" />
          </button>

          <button
            aria-label="Mark all read"
            className={`${toolbarBtnClass} disabled:cursor-not-allowed disabled:opacity-70`}
            disabled={isMarkingAllRead}
            onClick={() =>
              window.dispatchEvent(
                new CustomEvent(DASHBOARD_EVENTS.MARK_ALL_READ),
              )
            }
            type="button"
          >
            {isMarkingAllRead ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CheckCheck className="h-4 w-4" />
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
            <Settings2 className="h-4 w-4" />
          </button>

          <button
            aria-label="Sign out"
            className={`${toolbarBtnClass} disabled:cursor-not-allowed disabled:opacity-60`}
            disabled={isSigningOut}
            onClick={() => void handleSignOut()}
            type="button"
          >
            <LogOut className="h-4 w-4" />
          </button>

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
              <Sun className="h-4 w-4" />
            ) : (
              <Moon className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
